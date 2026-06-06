precision highp float;

uniform vec2 uRes;
uniform float uTime;
uniform vec3 uCamPos;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec3 uCamFwd;
uniform float uLensing;
uniform float uDisk;
uniform int uSteps;

#define M           1.0
#define HORIZON     2.0
#define PHOTON_R    3.0
#define DISK_IN     6.0
#define DISK_OUT    22.0
#define ESCAPE_R    60.0

#define STEP_SCALE  0.07
#define STEP_MIN    0.010
#define STEP_MAX    1.000
#define MAX_STEPS   384

#define TEMP_SCALE  8500.0
#define DISK_GAIN   2.6
#define DISK_ALPHA  0.45

#define PLANET_A_DIR    normalize(vec3(0.4, 0.1, -1.0))
#define PLANET_A_SIZE   0.012
#define PLANET_A_COL    vec3(0.3, 0.6, 0.8)
#define PLANET_B_DIR    normalize(vec3(-0.7, -0.2, -0.6))
#define PLANET_B_SIZE   0.008
#define PLANET_B_COL    vec3(0.8, 0.5, 0.3)


float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

vec3 planet(vec3 dir, vec3 planetDir, float size, vec3 baseCol){
    vec3 d = normalize(dir);
    vec3 p = normalize(planetDir);

    float c = dot(d, p);
    float disk = smoothstep(1.0 - size, 1.0 - 0.6 * size, c);
    if (disk <= 0.0)
        return vec3(0.0);
    
    vec3 lightDir = normalize(vec3(0.6, 0.4, 0.3));
    vec3 across = d - c * p;
    float shade = 0.65 + 0.35 * clamp(dot(across / max(size, 1e-4), lightDir) + 0.5, 0.0, 1.0);

    return baseCol * shade * disk;
}

vec3 starfield(vec3 dir) {
    vec3 d = normalize(dir);
    float stars = 0.0;

    vec3 p = d * 160.0;
    vec3 id = floor(p);
    vec3 f = fract(p) - 0.5;
    float h = hash(id);
    if (h > 0.982) stars += smoothstep(0.06, 0.0, dot(f, f)) * h;

    p = d * 380.0;
    id = floor(p);
    f = fract(p) - 0.5;
    h = hash(id + 41.0);
    if (h > 0.991) stars += smoothstep(0.035, 0.0, dot(f, f)) * 0.07;
    
    vec3 col = vec3(stars);
    float band = 0.5 + 0.5 * d.y;
    col += mix (vec3 (0.006, 0.007, 0.013), vec3(0.010, 0.009, 0.017), band) * 0.4;
    return col;
}

vec3 accel(vec3 x, float h2) {
    float r2 = dot (x, x);
    float r = sqrt(r2);
    return (-3.0 * M * h2) * x / (r2 * r2 * r);
}

float diskFlux(float r) {
    float x = DISK_IN / r;
    float f = x * x * x * (1.0 - sqrt (x));
    return max(f, 0.0);
}

vec3 blackbody(float T) {
    T = clamp (T, 1000.0, 15000.0) / 100.0;
    float r, g, b;

    if (T <= 66.0)
        r = 1.0;
    else
        r = 1.292936 * pow(T - 60.0, -0.1332047);

    if (T <= 66.0)
        g = 0.3900816 * log(T)        - 0.6318414;
    else
        g = 1.1298909 * pow(T - 60.0, -0.0755148);

    if (T >= 66.0)
        b = 1.0;
    else if (T <= 19.0) 
        b = 0.0;
    else
        b = 0.5432068 * log(T - 10.0) - 1.196254;

    return clamp(vec3(r, g, b), 0.0, 1.0);
}

vec3 diskColor(vec3 hit, float r) {
    float Iemit = diskFlux(r);
    float Temit = TEMP_SCALE * pow(Iemit, 0.25);

    float grav = sqrt(max(1.0 - HORIZON / r, 0.0));
    float beta = min(sqrt(M / r), 0.99);
    float gamma = 1.0 / sqrt(1.0 - beta * beta);

    vec3 tang = normalize(vec3(-hit.z, 0.0, hit.x));
    vec3 toCam = normalize(uCamPos - hit);
    float cosA = dot(tang, toCam);
    float delta = 1.0 / (gamma * (1.0 - beta * cosA));
    float g = grav * delta;

    float Tobs = min (g * Temit, 7800.0);
    vec3 col = blackbody(Tobs) * vec3(1.0, 0.86, 0.58);
    float Iobs = (g * g) * (g * g) * Iemit;

    float ang = atan(hit.z, hit.x);
    float swirl = 0.9 + 0.1 * sin(ang * 5.0 - r * 1.3 + uTime * 1.4);

    float edge = smoothstep(DISK_IN, DISK_IN + 0.6, r) * smoothstep(DISK_OUT, DISK_OUT - 4.0, r);

    return col * (Iobs * DISK_GAIN * swirl * edge);
}

vec3 aces(vec3 x) {
    const float 
        a = 2.51, 
        b = 0.03,
        c = 2.43,
        d = 0.59,
        e = 0.14;
    return clamp((x * (a * x + b))/ (x * (c * x + d)+ e), 0.0, 1.0);
}

void main () {
    vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
    vec3 dir = normalize(uCamFwd + uv.x * uCamRight + uv.y * uCamUp);

    vec3 x = uCamPos;
    vec3 v = dir;

    vec3 L = cross(x, v);
    float h2 = dot(L, L);
    
    vec3 col = vec3 (0.0);
    float transmit = 1.0;
    bool captured = false;

    for (int i = 0; i < MAX_STEPS; i ++) {
        if (i >= uSteps)
            break;

        float r = length(x);
        if (r < HORIZON) {
            captured = true;
            break;
        }

        if (r > ESCAPE_R)
            break;

        float dl = clamp(STEP_SCALE * r,STEP_MIN, STEP_MAX);    

        vec3 k1x = v;
        vec3 k1v = uLensing * accel(x, h2);
        vec3 k2x = v + 0.5 * dl * k1v;
        vec3 k2v = uLensing * accel(x + 0.5 * dl * k1x, h2);
        vec3 k3x = v + 0.5 * dl * k2v;
        vec3 k3v = uLensing * accel(x + 0.5 * dl * k2x,  h2);
        vec3 k4x = v + dl * k3v;
        vec3 k4v = uLensing * accel(x + dl * k3x, h2);
        vec3 nx = x + (dl / 6.0) * (k1x + 2.0 * k2x + 2.0 * k3x + k4x);
        vec3 nv = v + (dl / 6.0) * (k1v + 2.0 * k2v + 2.0 * k3v + k4v);

        if (uDisk > 0.5 && x.y * nx.y < 0.0){
            float k   = x.y / (x.y - nx.y);   
            vec3  hit = mix(x, nx, k);
            float rr  = length(hit);
            if (rr > DISK_IN && rr < DISK_OUT){
                col      += diskColor(hit, rr) * transmit;
                transmit *= (1.0 - DISK_ALPHA); 
            }
        }

        x = nx;
        v = nv;
    }

    if (!captured){
        col += starfield(v) * transmit;
        col += planet(v, PLANET_A_DIR, PLANET_A_SIZE, PLANET_A_COL) * transmit;
        col += planet(v, PLANET_B_DIR, PLANET_B_SIZE, PLANET_B_COL) * transmit;
    }

    col = aces(col);
    col = pow(col, vec3(1.0 / 2.2));
    gl_FragColor = vec4(col, 1.0);
}