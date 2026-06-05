// Trivial full-screen-triangle vertex shader.
// main.ts uploads three vertices (-1,-1)(3,-1)(-1,3) - a single oversized
// triangle that covers the whole clip-space square, One triangle (not two)
// avoids a seam down the diagonal and is marginally cheaper than a quad.
attribute vec2 aPos;
void main(){
    gl_Position = vec4(aPos, 0.0, 1.0);
}
