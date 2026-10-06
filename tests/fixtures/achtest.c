/* Achievement test: a global counter ticks up forever and a flag byte stays 0. The
 * automated tests watch these RAM addresses with RetroAchievements-style triggers and
 * set the flag from outside once tracking is running.
 *   ach_counter at 0x8c0103c8 (RA address 0x0103c8), ach_flag at 0x8c0103cc (0x0103cc) */
#include "dc.h"

volatile unsigned int ach_counter;
volatile unsigned char ach_flag;

void main(void) {
    dc_video_init();
    dc_clear(dc_rgb(10, 40, 30));
    for (;;) {
        ach_counter++;
        dc_rect((ach_counter * 3) % (DC_W - 40), 200, 40, 40, dc_rgb(ach_flag ? 250 : 80, 200, 80));
        { volatile int d; for (d = 0; d < 3000; d++) { } }
    }
}
