import { coil, contact, counterBox, parallel, rung, timer, type LadderProgram } from './model.js';

/** The program a new project starts with — three classic patterns to play with. */
export function demoProgram(): LadderProgram {
	return {
		version: 1,
		rungs: [
			rung(
				[parallel([[contact('NO', 'I0.0')], [contact('NO', 'Q0.0')]]), contact('NC', 'I0.1')],
				[coil('COIL', 'Q0.0')],
				'Motor start / stop with self-holding. I0.0 = start, I0.1 = stop.'
			),
			rung(
				[contact('NO', 'Q0.0'), timer('TON', 'T0', 'T#3s')],
				[coil('COIL', 'Q0.1')],
				'"Running" lamp lights 3 s after the motor starts.'
			),
			rung(
				[contact('NO', 'I0.0'), counterBox('CTU', 'C0', '5', 'I0.2')],
				[coil('COIL', 'Q0.2')],
				'Service lamp after 5 starts. I0.2 resets the counter.'
			)
		]
	};
}

export function emptyProgram(): LadderProgram {
	return { version: 1, rungs: [rung([contact()], [coil()])] };
}
