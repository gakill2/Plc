/** The demo program: the motor latch from the ladder demo, as an S7-300 would have it. */
export const DEMO_STL = `// Silnik z samopodtrzymaniem — tak samo jak w drabince demo
NETWORK 1 // start / stop
      A(
      O     I 0.0          // Start
      O     Q 0.0          // podtrzymanie
      )
      A     I 0.1          // Stop (NC)
      =     Q 0.0          // Silnik

NETWORK 2 // lampka „pracuje” po 2 s
      A     Q 0.0
      L     S5T#2S
      SD    T 1
      A     T 1
      =     Q 0.1
`;
