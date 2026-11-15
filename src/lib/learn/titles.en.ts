/**
 * English titles and summaries of the learning path (chapters and lessons). The chapter and
 * lesson content itself is still Polish — the path, the index and the editor headers are not.
 */
export const EN_TITLES: Record<string, { title: string; summary: string }> = {
	'chapter:czym-jest-plc': {
		title: 'What a PLC is',
		summary: 'Inputs, outputs, a program — and how a PLC differs from an Arduino.'
	},
	'chapter:cykl-skanowania': {
		title: 'The scan cycle',
		summary: 'The key idea of a PLC: read inputs → run the program → write outputs, over and over.'
	},
	'chapter:adresowanie': {
		title: 'Addresses and memory',
		summary: 'I, Q, M, bits, bytes and words — what I0.3 or MW10 means.'
	},
	'chapter:elektryka': {
		title: 'Wiring a PLC: power, sensors, outputs',
		summary: '24 V DC, PNP and NPN sensors, sink / source inputs, relay and transistor outputs.'
	},
	'chapter:styki-i-cewki': {
		title: 'Contacts and coils',
		summary: 'The basic ladder elements: normally open contact, normally closed contact and coil.'
	},
	'lesson:first-rung': {
		title: 'Your first rung',
		summary: 'A button lights a lamp — contacts, coils and the scan cycle.'
	},
	'chapter:logika': {
		title: 'Logic: AND, OR, NOT',
		summary: 'Contacts in series are AND, in parallel OR.'
	},
	'lesson:and-or': { title: 'AND and OR', summary: 'Contacts in series are AND, in parallel OR.' },
	'lesson:bug-double-coil': {
		title: 'Find the bug: a lamp from two places',
		summary: 'Two buttons, one lamp — and only one button works.'
	},
	'chapter:podtrzymanie': {
		title: 'Latching and SET / RESET',
		summary: 'How the PLC “remembers” that a motor keeps running after the button is released.'
	},
	'lesson:self-holding': {
		title: 'Start / stop with a latch',
		summary: 'The most common circuit in industry: a motor that holds itself on.'
	},
	'lesson:bug-set-reset-order': {
		title: 'Find the bug: a Stop that loses',
		summary: 'The order of networks matters — whoever writes last wins.'
	},
	'chapter:zbocza': { title: 'Signal edges', summary: 'Why a held button should count only once.' },
	'lesson:toggle': {
		title: 'Edges: one button, on and off',
		summary: 'Detect the rising edge so that a held button counts once.'
	},
	'lesson:bug-flicker': {
		title: 'Find the bug: a flickering lamp',
		summary: 'A one-button toggle that works “at random”.'
	},
	'chapter:timery': {
		title: 'Timers: TON, TOF, TP',
		summary: 'On-delay, off-delay and pulse — on a timing diagram.'
	},
	'lesson:traffic-light': {
		title: 'Timers: a traffic light',
		summary: 'Build a timed sequence with a TON timer and compares.'
	},
	'lesson:bug-timer-edge': {
		title: 'Find the bug: a timer that never times',
		summary: 'The lamp should light after 3 s — and it never does.'
	},
	'chapter:liczniki': {
		title: 'Counters and compares',
		summary: 'Counting parts on a belt and comparing numbers.'
	},
	'lesson:sorting-conveyor': {
		title: 'Plant: a sorting conveyor',
		summary: 'Pulse timers and counters on an almost real line.'
	},
	'chapter:liczby-i-analog': {
		title: 'Numbers and analog signals',
		summary: 'Data types, overflow, 4–20 mA and 0–10 V, scaling to degrees and bar.'
	},
	'lesson:crane-positioning': {
		title: 'Crane: positioning with an encoder',
		summary: 'Drive the trolley to station A or B: fast, then slow, and stop exactly and safely.'
	},
	'chapter:podstawy-automatyki': {
		title: 'Control basics: feedback and process models',
		summary:
			'Open and closed loop, typical processes (lag, dead time, integrating, oscillating), reading K, T and τ from a step response, and first controller settings.'
	},
	'chapter:regulacja': {
		title: 'Control: on/off and PID',
		summary: 'Holding a temperature: on/off with hysteresis, then a PID controller.'
	},
	'lesson:oven-pid': {
		title: 'Oven: tuning a PI controller',
		summary:
			'A PI controller in Structured Text oscillates. Tune Kp and Ti and add a door interlock.'
	},
	'lesson:oven-pid-lad': {
		title: 'The oven in ladder: the PID block',
		summary:
			'The same oven in LAD: insert the PID block from the library, connect its pins and tune it.'
	},
	'chapter:structured-text': {
		title: 'Structured Text (ST)',
		summary: 'The same program in ladder and in text.'
	},
	'lesson:tank-fbd': {
		title: 'FBD: a tank on an SR flip-flop',
		summary:
			'The same tank as in the ladder lesson, in Function Block Diagram: an SR flip-flop with a negated input.'
	},
	'chapter:organizacja': {
		title: 'Program organisation: blocks and structure',
		summary:
			'OB, FC, FB, DB, instances — and how to lay out a bigger program so it stays maintainable.'
	},
	'lesson:fb-motor': {
		title: 'Function block: one motor, three conveyors',
		summary: 'Write a motor FUNCTION_BLOCK with feedback monitoring and use it in three instances.'
	},
	'lesson:std-motor': {
		title: 'Device standard: a motor with modes, permissives and interlocks',
		summary:
			'Write the block a plant uses for every motor: Auto and Manual, permissives for starting only, interlocks always, contactor supervision and acknowledge.'
	},
	'lesson:std-conveyors': {
		title: 'The standard in practice: a conveyor line with cascade stop',
		summary:
			'The same MotorStd block three times: belts start from the end of the line, and when one stops, all before it stop without spilling material.'
	},
	'lesson:oven-filter': {
		title: 'Arrays, RETAIN and a cyclic interrupt: a sensor filter',
		summary:
			'Sample the temperature every 100 ms in a cyclic interrupt, average 10 samples in an array and count alarms in RETAIN memory.'
	},
	'lesson:recipe-index': {
		title: 'Find the bug: the CPU stops on a recipe',
		summary:
			'A wrong recipe number from the panel goes past the array and stops the PLC. Guard the program and add OB121.'
	},
	'chapter:typy-danych': {
		title: 'Data types in practice: UDTs, data blocks and STRING',
		summary:
			'How TIA Portal keeps machine data: own types (UDT), global data blocks, start values and RETAIN, strings — and recipes as data, not code.'
	},
	'lesson:recipe-db': {
		title: 'Data types: recipes in a data block (UDT, DB, STRING)',
		summary:
			'Move the mixer recipes from a CASE in the code into a data block: a Recipe type with a name (STRING), an array of recipes in a DB, a whole-structure copy per batch — and a new recipe without changing code.'
	},
	'chapter:bezpieczenstwo': {
		title: 'Safety and good practice',
		summary: 'Why a Stop button is wired as an NC contact, and other rules from the field.'
	},
	'lesson:tank-level': {
		title: 'Plant: level control in a tank',
		summary: 'On/off control with SET / RESET keeps the level between two sensors.'
	},
	'lesson:bug-stop-nc': {
		title: 'Find the bug: the motor will not start',
		summary:
			'The program looks like a textbook, yet the machine stands still. Blame the wiring… or not.'
	},
	'chapter:sekwencje': {
		title: 'Sequential control (steps)',
		summary: 'How to program a machine that does “first this, then that”.'
	},
	'lesson:drilling-station': {
		title: 'Plant: a drilling station (sequence)',
		summary: 'A real machine sequence: stop the part, drill, release, check, reject.'
	},
	'lesson:sfc-drilling': {
		title: 'SFC: the drilling station in steps',
		summary: 'The same drilling station as an SFC / GRAFCET chart: steps, actions and transitions.'
	},
	'lesson:pneumatic-press': {
		title: 'Pneumatic press: A+ B+ B− A− with motion supervision',
		summary:
			'A classic pneumatics task: clamp and press on 5/2 valves, a step program in CASE and an alarm when a cylinder does not arrive.'
	},
	'lesson:mixer-batch': {
		title: 'Batch mixer in SFC: dosing, heating and interlocks',
		summary:
			'A batch: 40 % of A, B up to 80 %, heating while stirring to 50 °C, 5 s of mixing, drain. A noisy level measurement — and what if the 4–20 mA wire breaks.'
	},
	'chapter:panel-hmi': {
		title: 'Operator panel (HMI) and alarms',
		summary: 'How an operator runs a machine from a panel and how the PLC reports faults.'
	},
	'lesson:hmi-start': {
		title: 'HMI panel: start and stop from the screen',
		summary:
			'Operators want to run the motor from the panel — without breaking the cabinet buttons.'
	},
	'chapter:alarmy-hmi': {
		title: 'Alarms and screens that help: ISA-18.2 and ISA-101',
		summary:
			'Why 200 alarms a shift is no alarm at all: priorities, rationalization, chattering and standing alarms, suppression — and how to design HMI screens.'
	},
	'lesson:alarm-flood': {
		title: 'Alarm management: an alarm flood on the MX2 panel',
		summary:
			'The operator gets dozens of alarms per batch and stopped reading them. Rationalize the list per ISA-18.2 — priorities, responses, delays, suppression — so a normal batch raises none.'
	},
	'chapter:uruchomienie': {
		title: 'Commissioning a machine',
		summary: 'Signal tests, typical wiring faults and how to find them before the machine moves.'
	},
	'lesson:commissioning-conveyor': {
		title: 'Commissioning: a conveyor with a sensor',
		summary: 'The program is proven — but the electrician made mistakes. Find the wiring faults.'
	},
	'chapter:falownik': {
		title: 'Frequency inverter: motor speed control',
		summary: 'Frequency, ramps, control from the PLC via digital and analog signals, drive faults.'
	},
	'lesson:vfd-fan': {
		title: 'Inverter: a fan with two speeds',
		summary: 'You drive the inverter: RUN / REV, a speed setpoint in an analog word, fault reset.'
	},
	'lesson:commissioning-vfd': {
		title: 'Commissioning: a pump on an inverter',
		summary:
			'The pump should run at 35 Hz and stands still. Find the faults in the inverter wiring.'
	},
	'chapter:falownik-wnetrze': {
		title: 'Inside an inverter: rectifier, DC link, IGBT and PWM',
		summary:
			'Where the variable frequency comes from, why the voltage rises with it (V/f) and what vector control does differently.'
	},
	'chapter:falownik-siec': {
		title: 'Inverters on the network: PROFIdrive, parameters, fault diagnosis',
		summary:
			'Commissioning a drive, control and status words, the PROFIdrive state machine and where overcurrent, overvoltage and overheating come from.'
	},
	'lesson:drive-profidrive': {
		title: 'An inverter on Profinet: the control word',
		summary:
			'Drive it like a SINAMICS: 047E, 047F, speed 16#4000, status from ZSW1 and fault acknowledge.'
	},
	'chapter:ruch-plcopen': {
		title: 'Positioning and PLCopen Motion: axes, homing, MC_ blocks',
		summary:
			'From an inverter to a servo: encoders and homing, the motion profile, following error, limit switches — and how a program drives an axis with PLCopen blocks.'
	},
	'lesson:motion-pickplace': {
		title: 'PLCopen motion: a pick-and-place axis with MC_Power, MC_Home and MC_MoveAbsolute',
		summary:
			'A positioning servo: power the axis, home it, carry parts between two stations with a trapezoid profile, stop it on a ramp and recover from an axis error — with PLCopen blocks.'
	},
	'chapter:komunikacja': {
		title: 'Industrial networks: Profinet, Modbus, remote I/O',
		summary:
			'Why you do not pull a cable to every sensor, how network data reaches the process image and what to do when the network fails.'
	},
	'lesson:remote-pump': {
		title: 'Network: a pump in a remote station and a watchdog',
		summary:
			'The pump is behind a network. Detect lost communication with a life counter and go to a safe state.'
	},
	'chapter:sieci-ot': {
		title: 'OT networks in practice: IP, masks, switches, VLANs, diagnosis',
		summary:
			'Addressing a machine, subnets and gateways, managed switches and VLANs, ring topology, and finding in 5 minutes why something does not connect.'
	},
	'chapter:scada-iiot': {
		title: 'Above the PLC: SCADA, OPC UA, MQTT and historians',
		summary:
			'The layered plant model (Purdue), SCADA versus HMI, how PLC data reaches servers: OPC UA, MQTT, historian, MES.'
	},
	'chapter:cyber-ot': {
		title: 'OT cybersecurity: zones, conduits and remote access',
		summary:
			'Why a machine network must not be “flat”, zones and conduits per IEC 62443, DMZ, firewalls, remote service and everyday habits.'
	},
	'chapter:bezpieczenstwo-maszyn': {
		title: 'Machine safety: safety circuits and PL',
		summary:
			'Risk assessment, performance level PL, categories, safety relays, guards with locking and two-hand control.'
	},
	'lesson:two-hand-press': {
		title: 'Safety: two-hand control of a press',
		summary:
			'Both hands within 0.5 s, releasing either one stops, a new cycle only after releasing both.'
	},
	'chapter:f-cpu': {
		title: 'Safety PLC (F-CPU): the F-program, 1oo2 inputs, passivation',
		summary:
			'When a safety relay is not enough: a separate safety program, two-channel inputs, ESTOP1, FDBACK and the F-signature.'
	},
	'lesson:f-estop': {
		title: 'Safety PLC: e-stop and contactor monitoring in the F-program',
		summary:
			'Move the emergency stop from the standard program into the safety program: ESTOP1, a two-channel input with discrepancy, FDBACK for a welded contactor.'
	},
	'chapter:szafa-sterownicza': {
		title: 'The control cabinet: 24 V supply, protection, EMC and documentation',
		summary:
			'Sizing the power supply, circuit protection, wire colours, earthing and shielding, device tags and reading a schematic.'
	},
	'chapter:schematy': {
		title: 'Reading an electrical schematic (EPLAN): tags, cross references, troubleshooting',
		summary:
			'How cabinet documentation is organised, what =T1+S1-K1 and /4.2 mean, the contact mirror, terminal strips — and finding a broken wire with a multimeter and the schematic.'
	},
	'chapter:sprzet': {
		title: 'Hardware configuration: modules, addresses and analog cards',
		summary:
			'How the program knows the valve is at Q0.0 and the level at IW64 — and what happens when a card measures the wrong thing.'
	},
	'lesson:hw-config': {
		title: 'Hardware configuration: a new cabinet for the MX2 mixer',
		summary:
			'The program is done, the cabinet is wired, yet the machine will not start. Set the module addresses and analog measuring types as the I/O list requires.'
	},
	'chapter:cudzy-kod': {
		title: 'Someone else’s program: STL/AWL and modernisation',
		summary:
			'How to read an old S7-300 program and change it without breaking what has worked for years.'
	},
	'lesson:stl-pump': {
		title: 'Find the bug in STL: a pump that Stop does not always stop',
		summary:
			'First contact with AWL from an old S7-300: read the program, find why a held Start beats Stop, and fix it with one bracket.'
	},
	'lesson:brownfield-press': {
		title: 'Legacy program: a change order on a 2009 press',
		summary:
			'Someone else’s AWL program, no symbols, no comments, running for years. Add automatic mode and a counter — without breaking what works.'
	},
	'chapter:projekt-koncowy': {
		title: 'Final project: from a functional description to the FAT',
		summary: 'What a real job looks like: FDS, I/O list, program, HMI, alarms and acceptance.'
	},
	'lesson:capstone-mixer': {
		title: 'Final project: the MX2 mixer from a functional description',
		summary:
			'A whole machine from scratch, like at work: specification, sequence, recipes, alarms, HMI and FAT acceptance. Then a code review.'
	}
};

export const EN_STAGES: Record<string, string> = {
	'czym-jest-plc': 'Stage 1 · How a PLC works',
	'styki-i-cewki': 'Stage 2 · Bit logic',
	timery: 'Stage 3 · Time and counting',
	'structured-text': 'Stage 4 · Structured Text and good practice',
	sekwencje: 'Stage 5 · Sequences and processes',
	'panel-hmi': 'Stage 6 · On site: HMI, commissioning, drives',
	komunikacja: 'Stage 7 · Infrastructure: networks, IT/OT, safety and the cabinet',
	sprzet: 'Stage 8 · On the job: hardware, legacy code, final project'
};
