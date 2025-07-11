# Technical Specifications

## Project Overview

The DigitalLabKit is a comprehensive toolkit for testing and interacting with integrated circuits (ICs). It combines hardware components (Arduino Mega and ESP32) for IC interfacing and a web-based front-end for user control and visualization.

## Components

### 1. Arduino Mega Test (`ArduinoMegaTest/`)

*   **Purpose:** Acts as the primary IC logic tester. It can configure GPIO pins to simulate inputs and read outputs of a connected IC.
*   **Hardware:** Arduino Mega
*   **Functionality:**
    *   Defines profiles for various ICs (e.g., 74xx series logic gates) including pin configurations (VCC, GND, INPUT, OUTPUT) and internal logic gate structures.
    *   Communicates via Serial port to receive commands and send status/pin data.
    *   Commands:
        *   `IC:<name>`: Selects the IC to test (e.g., `IC:7400`).
        *   `PINS:<14bits>`: Sets the input pin states for the selected IC.
        *   `STATUS`: Requests the current status (selected IC, gate count, input pin count).
        *   `LIST`: Lists available IC profiles.
        *   `SYNC`: Checks connectivity.
    *   Periodically sends current pin states (`PINS:<14_bit_string>`).
    *   Supports physical buttons to toggle input pin states on the connected IC.
*   **Key Files:**
    *   `src/main.cpp`: Contains the main Arduino sketch, including IC database, pin manipulation logic, and serial command handling.
    *   `platformio.ini`: Project configuration for PlatformIO.
*   **Dependencies:** Arduino framework.

### 2. ESP32 DHT Sensor (`DHTESP32/`) & ESP32 Nextion (`NEXTION with ESP32/`)

*These two projects have very similar `main.cpp` files, suggesting one might be an evolution of the other or they serve a similar role in different contexts. The primary difference seems to be how they interact with a Nextion display and handle specific commands.*

*   **Purpose:** This ESP32 component acts as a bridge between a Nextion HMI display, a serial interface (likely to a host computer or the Arduino Mega), and a BLE (Bluetooth Low Energy) interface for wireless control via the web front-end.
*   **Hardware:** ESP32 microcontroller.
*   **Functionality:**
    *   **Serial Communication:**
        *   Communicates with a Nextion HMI display via HardwareSerial (`SerialNextion` on GPIO16, GPIO17).
        *   Communicates with a host (e.g., PC for debugging or another microcontroller) via USB Serial (`Serial`).
    *   **BLE Server:**
        *   Creates a BLE server with a custom service (`SERVICE_UUID: 00000000-0000-1000-8000-00805f9b34fb`).
        *   **BLE Characteristics:**
            *   `IC_CHAR_UUID` (Write): To receive the selected IC name.
            *   `PINS_CHAR_UUID` (Read/Write/Notify): To send/receive IC pin states.
            *   `CLOCK_CHAR_UUID` (Read/Write): For clock-related commands (e.g., pulse, restart) - more prominent in `NEXTION with ESP32`.
            *   `STATUS_CHAR_UUID` (Notify): To send status updates.
    *   **Command Handling:**
        *   Relays commands received from Nextion, USB Serial, or BLE to the other interfaces.
        *   Nextion commands:
            *   `BLE:ON` / `BLE:OFF`: Enable/disable BLE server.
            *   `IC:<name>`: Selects IC, updates Nextion display (`t0.txt`), and forwards to BLE.
            *   `PINS:<data>`: Pin data from Nextion, forwards to BLE and USB Serial. Updates Nextion `IcVisualiser.t1.txt` (in `NEXTION with ESP32`).
            *   `CLOCK:PULSE`, `RESTART`: Clock/control commands, forwarded to BLE (in `NEXTION with ESP32`).
        *   USB Serial commands:
            *   `IC:<name>`: Selects IC, updates Nextion and BLE.
            *   `PINS:<data>`: Pin data, forwards to Nextion and BLE.
        *   BLE `PinsCharCallbacks`: When pin data is written via BLE, it's forwarded to Nextion and USB Serial.
*   **Key Files:**
    *   `src/main.cpp`: Implements BLE server, serial communication handling, and command routing.
    *   `platformio.ini`: Project configuration for PlatformIO.
*   **Dependencies:**
    *   `BLEDevice`, `BLEServer`, `BLEUtils`, `BLE2902` (for ESP32 BLE).
    *   `HardwareSerial` (for ESP32).

### 3. ESP32 Test (`Esp_test_1_Jun3/`)

*   **Purpose:** Similar to the Arduino Mega Test, this project configures an ESP32 to act as an IC tester. It uses ESP32's GPIO pins.
*   **Hardware:** ESP32
*   **Functionality:**
    *   Defines IC profiles (similar to ArduinoMegaTest) for common logic ICs.
    *   Uses a different set of GPIO pins suitable for ESP32.
    *   Communicates via Serial port.
    *   Commands: `IC:<name>`, `PINS:<14bits>`, `STATUS`, `LIST`.
    *   Pin states are reported MSB first (pin 14 to pin 1).
    *   Includes button handling (commented out in the `loop` function but logic exists).
*   **Key Files:**
    *   `src/main.cpp`: Main ESP32 sketch.
    *   `platformio.ini`: Project configuration.
*   **Dependencies:** Arduino framework for ESP32.

### 4. Front-End (`FrontEnd/digitalkit/`)

*   **Purpose:** A web-based user interface for interacting with the IC testing hardware.
*   **Technology Stack:** Next.js (React framework), TypeScript.
*   **Functionality:**
    *   Allows users to select the connection type: Serial or BLE.
    *   **Serial Port Interface (`./components/SerialPortInterface`):**
        *   Connects to the hardware (Arduino Mega or ESP32 tester) via the Web Serial API.
        *   Allows IC selection from a predefined list or by manual input.
        *   Visualizes IC pin states (HIGH/LOW).
        *   Allows users to toggle input pin states.
        *   Sends commands to the device (e.g., `IC:`, pin data string).
        *   Receives and displays data from the device (pin states, status, errors).
        *   Debug log for serial communication.
        *   Handles connection management (port selection, baud rate, etc.).
        *   Serial Protocol (as per `FrontEnd/digitalkit/README.md`):
            *   Device to Interface: `IC:<name>`, `<pin_states_binary_string>`, `ERROR:message`, `SYNC:OK`.
            *   Interface to Device: `<pin_states_binary_string>`, `SYNC`, `PINS?`.
    *   **BLE Interface (`./components/BLEInterface`):**
        *   Connects to the ESP32 BLE bridge via the Web Bluetooth API.
        *   Similar functionalities to the Serial interface but uses BLE characteristics for communication:
            *   Writes to `IC_CHAR_UUID` to select IC.
            *   Writes to/Reads from `PINS_CHAR_UUID` for pin states.
            *   Receives notifications from `STATUS_CHAR_UUID`.
    *   User-friendly layout for IC testing, showing pin diagrams and controls.
*   **Key Files:**
    *   `app/page.tsx`: Main page, allows selection between Serial and BLE interfaces.
    *   `app/components/SerialPortInterface.tsx` (not provided but inferred): Component for Web Serial communication.
    *   `app/components/BLEInterface.tsx` (not provided but inferred): Component for Web Bluetooth communication.
    *   `app/components/IcVisualiser.tsx` (not provided but inferred): Component to display IC and pin states.
    *   `README.md`: Details features, serial protocol, and setup instructions.
    *   `package.json`: Lists dependencies (e.g., `next`, `react`, `typescript`).
    *   `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`: Configuration files.
*   **Dependencies:** Node.js, npm, React, Next.js, TypeScript. Web Serial API / Web Bluetooth API support in the browser.

### 5. HMI (`HMI/`)

*   **Purpose:** Contains files related to a Nextion HMI (Human Machine Interface) display.
*   **Files:**
    *   `esp32.HMI`: Likely the Nextion project file that can be opened in the Nextion Editor.
    *   `esp32.tft`: The compiled HMI file that is uploaded to the Nextion display.
    *   `aa.zi`: Could be a font file or another asset for the Nextion display.
*   **Functionality:** Provides a graphical interface on the Nextion display for controlling and monitoring the IC tester, interacting with the ESP32. The ESP32 code (`DHTESP32/src/main.cpp` and `NEXTION with ESP32/src/main.cpp`) includes logic to send data to and receive commands from this HMI.

## Communication Protocols

*   **Serial:** Used between:
    *   Arduino Mega / ESP32 IC tester and a host computer (via USB).
    *   ESP32 and Nextion HMI display (UART).
    *   Web Front-end (via Web Serial API) and the IC tester hardware.
    *   Baud rates: 115200 bps (for Arduino/ESP32 to PC/Web), 9600 bps (for ESP32 to Nextion).
*   **Bluetooth Low Energy (BLE):**
    *   Used between the ESP32 bridge and the Web Front-end (via Web Bluetooth API).
    *   Custom GATT service and characteristics for exchanging IC information, pin states, and status.

## Overall System Workflow (Example with BLE)

1.  **User Interface (Web Front-end):**
    *   User selects "BLE Connection".
    *   User selects an IC (e.g., "7400") from the list.
    *   The front-end writes the IC name ("7400") to the `IC_CHAR_UUID` of the connected ESP32.
2.  **ESP32 Bridge (`DHTESP32` or `NEXTION with ESP32`):**
    *   Receives the IC name via BLE.
    *   Sends the IC name to the Nextion display (e.g., `t0.txt="7400"`) via UART.
    *   Sends an `IC:7400` command to the Arduino Mega IC tester via its Serial interface (if connected this way, though the primary flow seems to be ESP32 also acting as tester or directly taking commands).
3.  **IC Tester (Arduino Mega or ESP32 `Esp_test_1_Jun3`):**
    *   (If Arduino is used) Receives `IC:7400`. Configures its GPIOs according to the "7400" profile.
    *   (If ESP32 tester is used directly via BLE commands) The ESP32 itself would handle the IC profile logic.
4.  **User Interaction (Web Front-end):**
    *   User toggles an input pin for the IC on the web interface.
    *   The front-end writes the new pin state string (e.g., "PINS:10100000000000") to the `PINS_CHAR_UUID` of the ESP32.
5.  **ESP32 Bridge:**
    *   Receives pin data via BLE.
    *   Forwards this pin data to the Nextion display (e.g., updating `IcVisualiser.t1.txt`).
    *   Forwards this pin data to the Arduino Mega (if applicable) or processes it directly if the ESP32 is the tester.
6.  **IC Tester:**
    *   Sets the physical pin states on the connected IC.
    *   Reads the resulting output pin states from the IC.
    *   Sends the complete pin state string (e.g., `PINS:10101100000000`) back.
7.  **ESP32 Bridge:**
    *   Receives pin states from the tester (or generates them if it is the tester).
    *   Notifies the Web Front-end with the new pin states via `PINS_CHAR_UUID`.
    *   Sends the pin states to the Nextion display.
8.  **User Interface (Web Front-end):**
    *   Receives pin state notification and updates the visual representation of the IC pins.

*(Note: The exact interaction between the ESP32 bridge and a separate Arduino IC tester needs clarification from further code analysis, as the ESP32 projects also contain IC testing logic themselves. It's possible the Arduino is optional or an alternative setup.)*

## Applications

The DigitalLabKit is designed for a variety of applications related to learning, testing, and experimenting with digital logic ICs.

1.  **Educational Tool:**
    *   **Learning Digital Logic:** Students can visually learn how different logic gates (AND, OR, NOT, NAND, NOR, XOR, XNOR) and common ICs (like decoders, multiplexers, flip-flops if profiles are added) function.
    *   **Hands-on Experimentation:** Provides a practical way to test theoretical knowledge by wiring ICs (on a breadboard connected to the tester) and observing their behavior through the web interface or Nextion display.
    *   **Understanding Pin Configurations:** Helps users understand VCC, GND, input, and output pins for various ICs.

2.  **IC Testing and Verification:**
    *   **Basic Functional Testing:** Quickly verify if an IC is functioning according to its truth table. Users can set input states and observe if the outputs are correct.
    *   **Troubleshooting Circuits:** When building digital circuits, this kit can help isolate faulty ICs or incorrect wiring by testing components individually.
    *   **Hobbyist Electronics:** Useful for electronics enthusiasts who work with 74xx series logic chips or other compatible ICs.

3.  **Prototyping and Development:**
    *   **Rapid Prototyping:** Allows developers to quickly test parts of a digital circuit design before committing to a PCB or more permanent setup.
    *   **Interface for Microcontroller Projects:** The hardware (Arduino/ESP32) can be controlled by the web UI to provide inputs to or read outputs from a circuit being prototyped.

## Component Interactions

The system is designed with modular components that can interact in flexible ways:

*   **Standalone IC Tester (Arduino Mega or ESP32 `Esp_test_1_Jun3`):**
    *   Can be used directly with a computer via Serial terminal for command-line IC testing.
    *   Physical buttons allow direct manipulation of input pins.
*   **Web Interface + IC Tester:**
    *   The Front-End connects via Web Serial to the Arduino Mega or ESP32 tester, providing a graphical interface for IC selection, pin control, and state visualization.
*   **Web Interface + ESP32 Bridge + IC Tester (e.g., Arduino Mega):**
    *   The Front-End connects via BLE to the ESP32 (`DHTESP32` or `NEXTION with ESP32`).
    *   The ESP32 acts as a wireless bridge, relaying commands to the Arduino Mega tester (connected via Serial to the ESP32) and sending data back to the Front-End.
*   **Web Interface + ESP32 (as Tester and Bridge):**
    *   The Front-End connects via BLE to an ESP32 (like `Esp_test_1_Jun3` enhanced with BLE capabilities, or `DHTESP32`/`NEXTION with ESP32` if they incorporate the full testing logic). The ESP32 performs both the IC testing and BLE communication.
*   **Nextion HMI + ESP32 Bridge + IC Tester (or ESP32 as Tester):**
    *   The Nextion display provides a local GUI.
    *   The ESP32 mediates between the Nextion display, the IC testing hardware (which could be itself or a separate Arduino), and potentially the BLE interface simultaneously.

## Target Users

*   **Students:** Learning digital electronics and computer engineering.
*   **Educators:** Teaching digital logic concepts.
*   **Hobbyists and Makers:** Experimenting with electronics and building projects.
*   **Technicians and Engineers:** For basic IC testing and debugging simple digital circuits.

## Future Scope and Potential Improvements

The DigitalLabKit provides a solid foundation for IC testing and education. Here are potential areas for future development:

1.  **Expanded IC Database:**
    *   **More Logic Families:** Add support for more TTL (74LS, 74HC, 74HCT) and CMOS (e.g., 4000 series) logic ICs.
    *   **Complex ICs:** Include profiles for more complex ICs like multiplexers, demultiplexers, decoders, encoders, flip-flops, latches, counters, and shift registers.
    *   **User-Defined IC Profiles:** Allow users to define and save custom IC profiles through the web interface, specifying pin configurations and basic logic.
    *   **Community Database:** Option to import/export IC profiles, potentially from a shared community repository.

2.  **Enhanced Testing Capabilities:**
    *   **Truth Table Verification:** Automatically test an IC against its known truth table and report discrepancies.
    *   **Dynamic Testing/Sequences:** Allow users to define a sequence of input changes and expected outputs to test sequential logic or specific operational modes.
    *   **Clock Generation:** Implement a controllable clock signal from the hardware (ESP32/Arduino) for testing clocked ICs. The `CLOCK_CHAR_UUID` in ESP32 suggests this might be partially envisioned.
    *   **Basic Analog Measurement:** If hardware allows (e.g., ESP32 ADC), incorporate basic voltage measurements on output pins, though this would require careful hardware design.
    *   **Short Circuit Detection:** Basic protection or detection for accidental short circuits.

3.  **Improved User Interface (Front-End):**
    *   **Interactive IC Diagrams:** More detailed and interactive diagrams that show internal gate structures for supported ICs.
    *   **Waveform Display:** Visualize input and output signals over time, especially useful for clock signals and sequential logic.
    *   **Project/Session Saving:** Allow users to save their current setup (selected IC, pin states, test sequences) and reload it later.
    *   **Tutorial Mode:** Guided tutorials for common ICs or digital logic concepts.
    *   **Mobile Responsiveness:** Ensure the web interface is fully usable on tablets and mobile devices.

4.  **Hardware Enhancements:**
    *   **Dedicated PCB:** Design a custom PCB for the tester to make it more robust and easier to use than breadboard setups. Could include ZIF (Zero Insertion Force) sockets for ICs.
    *   **Level Shifting:** Incorporate proper level shifters if testing ICs with different voltage requirements (e.g., 5V TTL with 3.3V ESP32).
    *   **Over-Current Protection:** Add hardware protection for GPIO pins.
    *   **Modular Hardware Design:** Allow for different hardware modules (e.g., for different IC package types or specialized testing).

5.  **Software and Firmware Improvements:**
    *   **Refined Serial/BLE Protocol:** Optimize data transfer and add more robust error handling and command structures.
    *   **Firmware Updates:** Mechanism for updating firmware on Arduino/ESP32, possibly via the web interface (more complex).
    *   **Code Modularity:** Further refactor Arduino/ESP32 code for better maintainability and easier addition of new IC profiles or features.
    *   **Automated Testing of Firmware:** Implement unit/integration tests for the firmware.

6.  **Documentation and Community:**
    *   **Comprehensive User Manuals:** Detailed guides for setting up and using each component.
    *   **Developer Documentation:** For those wanting to extend the IC database or contribute to the project.
    *   **Online Forum/Community:** A place for users to share experiences, custom IC profiles, and get help.

## Current Limitations

*   **Limited IC Support:** The current database primarily focuses on basic 74xx series gates.
*   **Manual Truth Table Verification:** Users need to manually check outputs against expected values.
*   **No Dynamic/Sequential Testing:** Primarily static input/output testing.
*   **Voltage Level Compatibility:** Assumes ICs are compatible with the microcontroller's logic levels (e.g., 5V for Arduino Mega, 3.3V for ESP32). Direct connection of 5V ICs to ESP32 without level shifting can damage the ESP32. The Arduino code seems to configure pins as OUTPUT LOW/HIGH, which is fine for TTL inputs but output reading needs care.
*   **Web Browser Dependency:** Relies on browsers supporting Web Serial or Web Bluetooth APIs.
*   **Nextion HMI Specificity:** The HMI files are specific to Nextion displays.
