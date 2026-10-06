/* Input + animation test for the web frontend: a bouncing square proves frames
 * advance; each held button lights its own box so the input path can be checked. */
#include "dc.h"

static void box(int i, int on, u16 color) {
    int x = 40 + (i % 5) * 116, y = 300 + (i / 5) * 80;
    dc_rect(x, y, 100, 60, on ? color : dc_rgb(40, 40, 56));
}

void main(void) {
    int f = 0, bx = 100, by = 100, dx = 4, dy = 3;
    dc_video_init();
    for (;;) {
        u32 p = dc_pad();
        dc_rect(0, 0, DC_W, 280, dc_rgb(16, 24, 64));
        bx += dx; by += dy;
        if (bx < 0 || bx > DC_W - 60) dx = -dx;
        if (by < 0 || by > 220) dy = -dy;
        dc_rect(bx, by, 60, 60, dc_rgb(240, 160, 40));
        box(0, p & DC_BTN_A, dc_rgb(60, 200, 80));
        box(1, p & DC_BTN_B, dc_rgb(220, 50, 50));
        box(2, p & DC_BTN_X, dc_rgb(60, 120, 230));
        box(3, p & DC_BTN_Y, dc_rgb(240, 220, 60));
        box(4, p & DC_BTN_START, dc_rgb(255, 255, 255));
        box(5, p & DC_BTN_UP, dc_rgb(200, 200, 200));
        box(6, p & DC_BTN_DOWN, dc_rgb(200, 200, 200));
        box(7, p & DC_BTN_LEFT, dc_rgb(200, 200, 200));
        box(8, p & DC_BTN_RIGHT, dc_rgb(200, 200, 200));
        box(9, (f >> 5) & 1, dc_rgb(255, 0, 255));
        f++;
        { volatile int d; for (d = 0; d < 20000; d++) { } }
    }
}
