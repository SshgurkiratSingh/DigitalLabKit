# DigitalLabKit Project Documentation

## 1. Introduction

Welcome to the DigitalLabKit project! This document provides a comprehensive overview of the entire system, including its architecture, components, applications, and future development roadmap.

The DigitalLabKit is a toolkit designed for testing, learning about, and interacting with digital logic Integrated Circuits (ICs). It combines microcontroller-based hardware for IC interfacing with a user-friendly web-based front-end and an optional Nextion HMI display for control and visualization.

## 2. Table of Contents

*   [1. Introduction](#1-introduction)
*   [2. Table of Contents](#2-table-of-contents)
*   [3. Overall Architecture](#3-overall-architecture)
*   [4. Technical Specifications](#4-technical-specifications)
    *   [4.1. Arduino Mega IC Tester (`ArduinoMegaTest/`)](#41-arduinomegatest--arduinomegatest)
    *   [4.2. ESP32 BLE Bridge & Nextion Interface (`DHTESP32/`, `NEXTION with ESP32/`)](#42-esp32-ble-bridge--nextion-interface-dhtesp32-nextion-with-esp32)
    *   [4.3. ESP32 IC Tester (`Esp_test_1_Jun3/`)](#43-esp32-ic-tester-esp_test_1_jun3)
    *   [4.4. Web Front-End (`FrontEnd/digitalkit/`)](#44-web-front-end-frontenddigitalkit)
    *   [4.5. Nextion HMI Files (`HMI/`)](#45-nextion-hmi-files-hmi)
    *   [4.6. Communication Protocols](#46-communication-protocols)
*   [5. Applications and Use Cases](#5-applications-and-use-cases)
    *   [5.1. Educational Tool](#51-educational-tool)
    *   [5.2. IC Testing and Verification](#52-ic-testing-and-verification)
    *   [5.3. Prototyping and Development](#53-prototyping-and-development)
*   [6. System Architecture and Component Interactions](#6-system-architecture-and-component-interactions)
    *   [6.1. Overview of Configurations](#61-overview-of-configurations)
    *   [6.2. Example Workflow (Web UI with BLE)](#62-example-workflow-web-ui-with-ble)
*   [7. Target Audience](#7-target-audience)
*   [8. Getting Started: Setup and Installation](#8-getting-started-setup-and-installation)
    *   [8.1. Hardware Requirements and Assembly](#81-hardware-requirements-and-assembly)
    *   [8.2. Firmware Deployment](#82-firmware-deployment)
    *   [8.3. Web Front-End Launch](#83-web-front-end-launch)
*   [9. Operational Guide](#9-operational-guide)
    *   [9.1. Establishing Connection with Hardware](#91-establishing-connection-with-hardware)
    *   [9.2. IC Selection Process](#92-ic-selection-process)
    *   [9.3. Manipulating and Observing Pin States](#93-manipulating-and-observing-pin-states)
    *   [9.4. Interacting with the Nextion HMI (Optional)](#94-interacting-with-the-nextion-hmi-optional)
*   [10. Development Roadmap: Future Scope and Potential Improvements](#10-development-roadmap-future-scope-and-potential-improvements)
*   [11. Known Issues and Current Limitations](#11-known-issues-and-current-limitations)
*   [12. Common Troubleshooting Steps](#12-common-troubleshooting-steps)
*   [13. How to Contribute](#13-how-to-contribute)
*   [14. Project License](#14-project-license)

## 3. System Overview and Core Components

The DigitalLabKit is architected around three main functional blocks:

1.  **IC Interface Hardware:** This is the physical layer that connects to the Integrated Circuit (IC) under test. It's typically an Arduino Mega or an ESP32 development board. Its primary responsibilities are:
    *   Setting specified logic levels (HIGH/LOW) on the IC's input pins.
    *   Reading the resulting logic levels from the IC's output pins.
    *   Providing power (VCC) and ground (GND) to the IC.
    *   Examples: `ArduinoMegaTest/`, `Esp_test_1_Jun3/`.

2.  **Communication Hub / Bridge (Often ESP32-based):** This optional but frequently used component enhances connectivity and user interaction. An ESP32 is well-suited due to its built-in Wi-Fi and Bluetooth capabilities.
    *   **Wireless Gateway:** Offers a Bluetooth Low Energy (BLE) interface, allowing the web front-end to connect and control the tester wirelessly.
    *   **HMI Driver:** Connects to and manages a Nextion HMI touchscreen display, providing a local graphical control panel.
    *   **Serial Aggregator/Router:** Can relay commands from various sources (BLE, Nextion, USB Serial) to the IC Interface Hardware if it's a separate microcontroller.
    *   Examples: `DHTESP32/`, `NEXTION with ESP32/`. In some configurations, this ESP32 might also directly perform the IC testing, merging roles.

3.  **User Interface (UI) Layer:** This is how the user interacts with the system.
    *   **Web Front-End (`FrontEnd/digitalkit/`):** A sophisticated browser-based application built with Next.js and TypeScript. It uses Web Serial or Web Bluetooth APIs to communicate with the hardware. It provides IC selection, pin visualization, input control, and debug information.
    *   **Nextion HMI (`HMI/`):** A physical touchscreen display offering a more direct, embedded control interface. Useful for standalone operation or when a PC is not readily available.

**(An architectural diagram showing these blocks and their primary data flows would be highly beneficial here.)**

## 4. Detailed Component Specifications

This section delves into the specifics of each major hardware and software module within the DigitalLabKit.

### 4.1. Arduino Mega IC Tester (`ArduinoMegaTest/`)

*   **Purpose:** Acts as the primary IC logic tester. It can configure GPIO pins to simulate inputs and read outputs of a connected IC.
*   **Hardware:** Arduino Mega
*   **Functionality:**
    *   Defines profiles for various ICs (e.g., 74xx series logic gates) including pin configurations (VCC, GND, INPUT, OUTPUT) and internal logic gate structures.
    *   Communicates via Serial port to receive commands and send status/pin data.
    *   Commands: `IC:<name>`, `PINS:<14bits>`, `STATUS`, `LIST`, `SYNC`.
    *   Periodically sends current pin states. Supports physical buttons.
*   **Key Files:** `src/main.cpp`, `platformio.ini`.
*   **Dependencies:** Arduino framework.

### 4.2. ESP32 BLE Bridge & Nextion Interface (`DHTESP32/`, `NEXTION with ESP32/`)

*   **Purpose:** These ESP32 projects serve as a communication hub, linking a Nextion HMI display, a serial interface (to a host PC or another microcontroller like the Arduino Mega), and a Bluetooth Low Energy (BLE) interface for wireless communication with the web front-end.
*   **Hardware:** ESP32 microcontroller.
*   **Functionality:**
    *   Manages UART communication with a Nextion HMI display (typically on `SerialNextion` using GPIOs 16 & 17).
    *   Provides a standard USB serial interface (`Serial`) for debugging or direct commands.
    *   Hosts a BLE server with custom GATT services and characteristics to:
        *   Receive selected IC name (`IC_CHAR_UUID`).
        *   Send and receive IC pin states (`PINS_CHAR_UUID`).
        *   Handle clock-related commands (`CLOCK_CHAR_UUID`).
        *   Send status updates (`STATUS_CHAR_UUID`).
    *   Routes commands and data seamlessly between Nextion, USB Serial, and BLE interfaces. For example, an IC selection from Nextion can be relayed to the BLE client.
*   **Key Files:** `src/main.cpp` (for logic implementation), `platformio.ini` (for build configuration and dependencies).
*   **Dependencies:** `BLEDevice`, `BLEServer`, `BLEUtils`, `BLE2902` (for ESP32 BLE functionality), `HardwareSerial`.

### 4.3. ESP32 IC Tester (`Esp_test_1_Jun3/`)

*   **Purpose:** An alternative IC tester implementation using an ESP32, functionally similar to the `ArduinoMegaTest` project.
*   **Hardware:** ESP32
*   **Functionality:** Defines IC profiles, uses ESP32 GPIOs, communicates via Serial with similar commands.
*   **Key Files:** `src/main.cpp`, `platformio.ini`.
*   **Dependencies:** Arduino framework for ESP32.

### 4.4. Web Front-End (`FrontEnd/digitalkit/`)

*   **Purpose:** Provides a rich, interactive web-based user interface for controlling the IC tester hardware and visualizing results.
*   **Technology Stack:** Next.js (a React framework), TypeScript, Tailwind CSS (likely, based on typical Next.js setups and `postcss.config.mjs`).
*   **Functionality:**
    *   Offers connection options via Web Serial API (for direct connection to Arduino/ESP32 testers) or Web Bluetooth API (for connection to the ESP32 BLE Bridge).
    *   Dynamically loads components for either Serial or BLE interaction based on user choice (`SerialPortInterface.tsx`, `BLEInterface.tsx`).
    *   Allows users to select target ICs from a predefined list (potentially fetched or hardcoded from `app/data/icData.ts`).
    *   Displays an interactive visual representation of the selected IC, showing pin numbers, types (INPUT, OUTPUT, VCC, GND), and current states (HIGH/LOW).
    *   Enables users to toggle the state of INPUT pins, with changes sent to the connected hardware.
    *   Receives and displays real-time updates of all pin states from the hardware.
    *   Includes a debug log panel to show raw serial/BLE communication and system messages.
    *   Manages connection lifecycle: port selection, connection establishment, error handling, and disconnection.
    *   Adheres to a specific serial communication protocol (detailed in `FrontEnd/digitalkit/README.md`) for commands like IC selection (`IC:<name>`), pin state setting (`<binary_string>`), and status requests (`PINS?`, `SYNC`).
*   **Key Files:**
    *   `app/page.tsx`: Main application page, handles connection type selection.
    *   `app/components/SerialPortInterface.tsx` and `app/components/BLEInterface.tsx`: (Inferred) Core logic for Web Serial and Web Bluetooth communications respectively.
    *   `app/components/IcVisualiser.tsx`: (Inferred) Component responsible for rendering the IC diagram and pin interactions.
    *   `app/data/icData.ts`: (Inferred) Likely contains definitions of ICs, their pinouts, and categories.
    *   `README.md`: Provides setup and operational instructions for the front-end.
    *   `package.json`: Defines project dependencies and scripts.
    *   Configuration files: `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`.
*   **Dependencies:** Node.js, npm/yarn, React, Next.js, TypeScript. Requires a modern browser with Web Serial API and/or Web Bluetooth API support (e.g., Chrome, Edge, Opera).

### 4.5. Nextion HMI Files (`HMI/`)

*   **Purpose:** Contains the project files for a Nextion Human-Machine Interface (HMI) touchscreen display.
*   **Files:**
    *   `esp32.HMI`: The source project file, editable with the Nextion Editor software. Defines the GUI layout, components (buttons, text boxes, gauges), and interaction logic.
    *   `esp32.tft`: The compiled HMI firmware file that is uploaded directly to the Nextion display.
    *   `aa.zi`: Potentially a font file or another graphical asset used by the Nextion project.
*   **Functionality:** Provides a standalone graphical interface on the Nextion physical display, allowing users to:
    *   Select ICs.
    *   View pin states (potentially on a visualizer component like `IcVisualiser` referenced in ESP32 code).
    *   Control BLE functionalities (e.g., turn BLE on/off).
    *   Trigger clock pulses or system restarts (as suggested by commands in `NEXTION with ESP32/src/main.cpp`).
    *   The ESP32 code (`DHTESP32/` and `NEXTION with ESP32/`) contains logic to receive commands from and send updates to this HMI (e.g., `sendToNextion("t0.txt=\"" + currentIC + "\"")`).

### 4.6. Communication Protocols

*   **Serial (UART):**
    *   **Tester-to-Host/Web Front-End:** Used between Arduino Mega/ESP32 IC testers and a host computer (via USB Serial) or the Web Front-End (via Web Serial API).
        *   Typical Baud Rate: 115200 bps.
        *   Commands: `IC:<name>`, `PINS:<binary_string>`, `STATUS`, `LIST`, `SYNC`.
        *   Data Format: ASCII strings, newline terminated.
    *   **ESP32-to-Nextion HMI:** Used for communication between the ESP32 bridge and the Nextion display.
        *   Typical Baud Rate: 9600 bps (configurable in Nextion Editor and ESP32 code).
        *   Data Format: Custom ASCII commands often terminated with `0xFF 0xFF 0xFF`. Examples: `t0.txt="7400"`, `IcVisualiser.t1.txt="10101010"`.
*   **Bluetooth Low Energy (BLE):**
    *   **ESP32 Bridge-to-Web Front-End:** Used for wireless communication between the ESP32 (acting as a BLE server) and the Web Front-End (acting as a BLE client via Web Bluetooth API).
    *   **Service UUID:** `00000000-0000-1000-8000-00805f9b34fb`
    *   **Characteristics:**
        *   `IC_CHAR_UUID` (`...0001...`): Write-only, for setting the current IC name.
        *   `PINS_CHAR_UUID` (`...0002...`): Read/Write/Notify, for exchanging IC pin states (14-bit binary string).
        *   `CLOCK_CHAR_UUID` (`...0003...`): Read/Write, for clock-related operations.
        *   `STATUS_CHAR_UUID` (`...0004...`): Notify-only, for sending status messages from ESP32 to the client.
    *   Data Format: Strings representing IC names or binary pin data.

## 5. Applications and Use Cases

The DigitalLabKit serves multiple purposes, primarily focused on digital electronics education and experimentation:

1.  **Educational Tool:**
    *   **Interactive Learning:** Students can visualize IC pin configurations, input/output relationships, and the behavior of various logic gates and common ICs.
    *   **Practical Experimentation:** Bridges the gap between theoretical knowledge and hands-on practice by allowing real-time testing of ICs connected on a breadboard.
2.  **IC Testing and Verification:**
    *   **Functional Checks:** Quickly verify if an IC is working as per its datasheet's truth table by manually setting inputs and observing outputs.
    *   **Circuit Debugging:** Helps in troubleshooting digital circuits by allowing individual components to be tested and ruled out as sources of failure.
    *   **Hobbyist Use:** A valuable tool for electronics hobbyists working with discrete logic chips.
3.  **Prototyping and Development:**
    *   **Rapid Validation:** Allows for quick testing of small digital logic sections during the early stages of a project design.
    *   **Microcontroller Peripheral Simulation:** The tester hardware can simulate digital inputs to another microcontroller project or read its outputs.

## 6. System Architecture and Component Interactions

### 6.1. Overview of Configurations
The DigitalLabKit is modular, allowing for several operational setups:
*   **Direct Tester Mode:** An Arduino Mega or ESP32 (`Esp_test_1_Jun3`) connects directly to a PC via USB. The user interacts using a serial monitor application or the Web Front-End via Web Serial. Physical buttons on the tester board can also control input pins.
*   **BLE-Bridged Mode (Full Setup):**
    *   The Web Front-End (client) connects wirelessly via Web Bluetooth to an ESP32 (`DHTESP32` or `NEXTION with ESP32`) acting as a BLE server.
    *   This ESP32 bridge can simultaneously:
        *   Communicate with a Nextion HMI display via UART for local control/display.
        *   Communicate with an IC Tester (like the Arduino Mega) via another UART or I2C/SPI (though current code primarily shows UART for inter-MCU, or the ESP32 itself acts as the tester).
*   **Integrated ESP32 Mode:** An ESP32 combines the roles of IC testing logic, BLE communication, and Nextion HMI driving. This is suggested by the structure of `DHTESP32` and `NEXTION with ESP32` which include BLE characteristics for IC control, implying they might not always need a separate tester MCU.

### 6.2. Example Workflow (Web UI with BLE)
1.  **Connection:** User opens the Web Front-End and initiates a BLE connection, selecting the "ESP32-IC-Tester" device.
2.  **IC Selection:** User selects "7400" from the IC list in the web UI.
    *   Front-End writes "7400" to `IC_CHAR_UUID` on the ESP32.
    *   ESP32 receives this, updates its internal state, potentially sends "IC:7400" to a connected Arduino tester, and updates the Nextion display (`sendToNextion("t0.txt=\"7400\"")`).
3.  **Hardware Configuration:** The IC tester (Arduino or ESP32 itself) configures its GPIOs according to the 7400's pinout (VCC, GND, inputs, outputs).
4.  **User Input:** User clicks to toggle Pin 1 (an input) of the 7400 from LOW to HIGH in the web UI.
    *   Front-End calculates the new 14-bit pin state string (e.g., "10000000000000") and writes it to `PINS_CHAR_UUID`.
    *   ESP32 receives the pin string. It might forward this to an Arduino tester or directly manipulate its own GPIOs if it's the tester. The Nextion display's pin visualizer is also updated.
5.  **IC Logic Execution:** The IC tester applies the new logic level to Pin 1 of the 7400. The 7400's internal NAND gate logic produces new output states on its output pins.
6.  **State Feedback:** The IC tester reads all its relevant GPIO states (inputs and outputs connected to the IC).
    *   It forms a 14-bit string of current states and sends it back to the ESP32 bridge (if separate).
    *   The ESP32 bridge then sends this string as a notification on `PINS_CHAR_UUID`.
7.  **UI Update:** The Web Front-End receives the notification and updates the `IcVisualiser` component to reflect the new states of all pins, including the changed input and any resulting output changes.

## 7. Target Audience

This toolkit is aimed at a diverse group of users:
*   **Students:** Those learning digital electronics, computer architecture, or embedded systems.
*   **Educators:** Teachers and lecturers looking for practical tools for digital logic demonstration.
*   **Electronics Hobbyists and Makers:** Individuals experimenting with digital ICs for personal projects.
*   **Technicians and Engineers:** For quick, basic functional tests of common logic ICs during debugging or repair.

## 8. Getting Started: Setup and Installation

This section provides guidance on setting up the DigitalLabKit hardware and software components. For detailed instructions, always refer to the README files within individual project subdirectories (e.g., `FrontEnd/digitalkit/README.md`, and PlatformIO project configurations).

### 8.1. Hardware Requirements and Assembly
*   **Microcontrollers:**
    *   Arduino Mega 2560 (for `ArduinoMegaTest`).
    *   ESP32 Development Board (for `DHTESP32`, `NEXTION with ESP32`, `Esp_test_1_Jun3`).
*   **ICs for Testing:** Standard logic ICs (e.g., 74xx series).
*   **Breadboard and Jumper Wires:** For connecting the microcontroller to the IC under test.
*   **Nextion HMI Display (Optional):** If using the HMI feature (e.g., a 2.4" or 3.5" Nextion Basic display).
*   **Power Supply:** Appropriate power for your microcontroller (usually USB) and any external power required by the Nextion display or ICs.
*   **Assembly:**
    1.  Carefully wire the IC on a breadboard, connecting its VCC and GND pins to the microcontroller's power rails (ensure voltage compatibility, e.g., 5V for Arduino Mega, 3.3V for ESP32 outputs).
    2.  Connect the IC's input and output pins to the GPIO pins specified in the respective firmware (`ArduinoMegaTest/src/main.cpp` or `Esp_test_1_Jun3/src/main.cpp`). **Verify ESP32 GPIOs used are 3.3V tolerant for inputs if IC outputs 5V.**
    3.  If using the ESP32 bridge with a Nextion display, connect the ESP32's TX/RX pins (e.g., GPIO17 for TX to Nextion RX, GPIO16 for RX from Nextion TX).
    4.  If using an Arduino Mega as the tester with an ESP32 bridge, connect their serial ports (e.g., ESP32 `Serial2` TX/RX to Arduino Mega `Serial1` RX/TX, ensuring a common ground).

### 8.2. Firmware Deployment
*   **Prerequisites:** PlatformIO IDE (installed in VS Code or as PlatformIO Core CLI).
*   **For Arduino Mega and ESP32 Projects:**
    1.  Open the specific project folder (e.g., `ArduinoMegaTest`, `DHTESP32`) in PlatformIO.
    2.  Connect the microcontroller to your computer via USB.
    3.  PlatformIO should auto-detect the board and port, or you may need to configure `platformio.ini` for your specific board/port (e.g., `upload_port`).
    4.  Build and upload the firmware using PlatformIO's "Upload" command (or `pio run -t upload` from the CLI).
*   **For Nextion HMI (`HMI/esp32.tft`):**
    1.  Format a microSD card to FAT32 (max 32GB).
    2.  Copy the `esp32.tft` file to the root of the microSD card.
    3.  Power off the Nextion display, insert the microSD card, and then power it on. The firmware update should start automatically. Remove the card after successful completion and reboot the display.

### 8.3. Web Front-End Launch
*   **Prerequisites:**
    *   Node.js (LTS version, e.g., 18.x or 20.x, is recommended).
    *   npm (comes with Node.js) or yarn.
*   **Setup Steps (refer to `FrontEnd/digitalkit/README.md` for the most current instructions):**
    1.  Navigate to the `FrontEnd/digitalkit/` directory in your terminal.
    2.  Install dependencies: `npm install` (or `yarn install`).
    3.  Start the development server: `npm run dev` (or `yarn dev`).
    4.  Open your web browser (Chrome, Edge, or Opera are recommended for best Web Serial/Web Bluetooth API support) and go to `http://localhost:3000` (or the port indicated by Next.js).

## 9. Operational Guide

This guide outlines the basic steps to operate the DigitalLabKit using the web front-end.

### 9.1. Establishing Connection with Hardware
1.  **Launch Web Front-End:** Ensure the front-end is running locally in your browser (see section 8.3).
2.  **Select Connection Type:** On the main page of the web UI, choose either "Serial Connection" or "BLE Connection".
    *   **For Serial Connection:**
        *   Click the "Connect" or "Select Port" button.
        *   A browser-native dialog will appear listing available serial ports. Select the port corresponding to your Arduino Mega or ESP32 IC tester (e.g., `COMx` on Windows, `/dev/ttyUSBx` or `/dev/ttyACMx` on Linux/macOS).
        *   The application typically uses a baud rate of 115200 for communication with the testers.
    *   **For BLE Connection (with ESP32 Bridge):**
        *   Click the "Connect BLE Device" or similar button.
        *   A browser-native dialog will appear, scanning for nearby BLE devices. Select your "ESP32-IC-Tester" (or similarly named device based on ESP32 firmware) from the list and click "Pair" or "Connect".
        *   The interface will then attempt to connect to the predefined BLE services and characteristics.
3.  **Connection Status:** The UI should provide feedback on the connection status (e.g., "Connected", "Disconnected", or error messages). The debug log panel can also offer more detailed insights.

### 9.2. IC Selection Process
1.  Once a connection to the hardware is established, locate the IC selection mechanism in the web UI (this is often a dropdown list or a searchable input field).
2.  Choose the specific IC part number (e.g., "7400", "7432") that you have physically wired to your tester hardware.
3.  Upon selection, this choice is automatically communicated to the connected hardware. The `IcVisualiser` component in the UI will update to display the pinout and current known states for the selected IC.

### 9.3. Manipulating and Observing Pin States
1.  **Visual Feedback:** The `IcVisualiser` component provides a graphical representation of the selected IC. Each pin is typically labeled with its number and function (INPUT, OUTPUT, VCC, GND). The current logic state (HIGH/LOW) of each pin is often indicated by color or text.
2.  **Controlling Input Pins:** For pins designated as INPUTs on the IC, you can typically click or toggle them in the UI to change their desired state from HIGH to LOW or vice-versa.
    *   This action triggers the web front-end to send the new overall pin state configuration (usually a binary string) to the hardware.
3.  **Observing Output Pins:** The states of pins designated as OUTPUTs (as well as the actual states of INPUTs after being set) are updated in the UI in (near) real-time based on the data received back from the hardware. This shows the IC's response to the applied input stimuli.
4.  **Debug Log:** Keep an eye on the debug log panel. It often shows the raw command strings being sent to the hardware and the data strings being received, which is invaluable for understanding the interaction and for troubleshooting.

### 9.4. Interacting with the Nextion HMI (Optional)
*   If your setup includes a Nextion HMI display connected to an ESP32 bridge:
    *   The HMI screen should power up and display its main interface (as designed in `HMI/esp32.HMI`).
    *   Depending on its programming, it might show the currently selected IC, its pin states, and provide touchscreen buttons or controls to:
        *   Select different ICs from a list or input field.
        *   Enable or disable BLE advertising/connection on the ESP32.
        *   Trigger specific actions like clock pulses or system resets (if these features are implemented in the ESP32 firmware and HMI project).
    *   Changes made via the Nextion HMI (e.g., selecting a new IC) should be processed by the ESP32. If the web front-end is also connected via BLE, these changes might be reflected back to the web UI if the ESP32 firmware is designed to synchronize states across interfaces.

## 10. Development Roadmap: Future Scope and Potential Improvements

The DigitalLabKit provides a solid foundation. Potential future enhancements include:

1.  **Expanded IC Database:** Support more logic families (CMOS 4000 series), complex ICs (mux, decoders, flip-flops), and user-defined/community-shared profiles.
2.  **Enhanced Testing:** Automatic truth table verification, dynamic test sequences, controllable clock generation, basic analog measurements (with hardware changes), short circuit detection.
3.  **Improved UI:** Interactive IC diagrams with internal logic, waveform display, session saving, tutorial modes, better mobile responsiveness.
4.  **Hardware Enhancements:** Dedicated PCB with ZIF sockets, level shifting, over-current protection, modular hardware design.
5.  **Software/Firmware:** Refined communication protocols, firmware update mechanisms, better code modularity, automated firmware testing.
6.  **Documentation/Community:** Comprehensive manuals, developer docs, online community forum.

## 11. Current Limitations

*   **Limited IC Support:** Primarily basic 74xx series gates.
*   **Manual Verification:** Users manually check truth tables.
*   **Static Testing:** No built-in dynamic or sequential test capabilities.
*   **Voltage Level Assumptions:** Assumes IC logic level compatibility with the microcontroller (3.3V for ESP32, 5V for Mega). Direct 5V IC connection to ESP32 GPIOs is risky without level shifters.
*   **Browser Dependency:** Web Serial/Bluetooth API support needed.
*   **Nextion HMI Specificity:** HMI files are for Nextion displays.

## 12. Common Troubleshooting Steps

*   **Connection Problems (Serial):**
    *   Ensure the correct serial port is selected in the browser.
    *   Verify the USB cable is properly connected and functional.
    *   Check that the tester hardware is powered on and has its firmware flashed correctly.
    *   Confirm the baud rate in the web UI matches the firmware (usually 115200).
    *   Close other applications (like Arduino IDE Serial Monitor, other terminal programs) that might be using the serial port.
    *   Check device manager (Windows) or `ls /dev/tty*` (Linux/macOS) to identify the correct port.
*   **Connection Problems (BLE):**
    *   Ensure Bluetooth is enabled on your computer and browser permissions are granted for Bluetooth access.
    *   Verify the ESP32 BLE bridge firmware is running and advertising. A blue LED on the ESP32 might indicate BLE activity.
    *   Try moving the ESP32 closer to the computer to rule out range issues.
    *   If pairing fails, try "forgetting" the device in your system's Bluetooth settings and then re-pairing through the web UI.
*   **IC Not Behaving as Expected:**
    *   Double-check all wiring between the microcontroller and the IC, especially VCC, GND, and signal pins.
    *   Verify the correct IC profile is selected in the web UI.
    *   Ensure the IC is not damaged; try a different chip of the same type if possible.
    *   Confirm logic levels are compatible (e.g., if using a 5V IC with a 3.3V ESP32, ensure inputs to ESP32 are 3.3V tolerant or use level shifters for outputs from the IC to the ESP32).
*   **Web Front-End Display Issues:**
    *   Clear browser cache and try a hard refresh (Ctrl+Shift+R or Cmd+Shift+R).
    *   Check the browser's developer console (usually F12) for any JavaScript errors.
    *   Ensure you are using a compatible browser (Chrome, Edge, Opera for best Web Serial/Bluetooth support).
*   **Nextion HMI Not Working:**
    *   Verify wiring between ESP32 and Nextion (ESP32 TX to Nextion RX, ESP32 RX to Nextion TX).
    *   Ensure the Nextion display has the correct `.tft` file loaded (from `HMI/` directory) and is powered adequately.
    *   Check baud rate settings in both ESP32 firmware (e.g., `SerialNextion.begin(9600, ...)` ) and the Nextion HMI project file (`esp32.HMI`, usually configured in Nextion Editor).

## 13. How to Contribute

This project welcomes contributions from the community! Here are some ways you can help:

*   **Reporting Bugs:** If you find a bug, please open an issue on the project's GitHub repository (if available, otherwise communicate to the project maintainers). Include detailed steps to reproduce the bug, your hardware setup (microcontroller type, IC used, Nextion model if any), browser version, and any relevant error messages or screenshots from the web UI's debug log or browser console.
*   **Suggesting Enhancements:** Have an idea for a new feature (e.g., support for a new IC, a new testing mode) or an improvement to an existing one? Open an issue to discuss it, outlining the benefits and potential implementation ideas.
*   **Submitting Code Changes (Pull Requests):**
    1.  If a GitHub repository exists, fork it.
    2.  Create a new branch for your feature or bug fix (e.g., `feature/add-74hc595-profile` or `fix/ble-connection-timeout`).
    3.  Make your changes, adhering to the existing coding style and conventions found in the codebase.
    4.  Test your changes thoroughly with relevant hardware setups.
    5.  Commit your changes with clear and descriptive commit messages (e.g., "feat: Add support for 74HC595 shift register", "fix: Resolve BLE characteristic discovery issue on Android").
    6.  Push your branch to your fork.
    7.  Open a pull request against the main project repository. Provide a clear description of the changes, why they are needed, and how you tested them.
*   **Improving Documentation:** If you find areas in this document or other READMEs that are unclear, incomplete, or incorrect, please feel free to suggest improvements or submit pull requests with your changes.
*   **Adding IC Profiles:** One of the most direct ways to contribute is by expanding the database of supported ICs. This usually involves:
    *   For firmware: Adding new `ICProfile` structs to the `IC_DB` array in `ArduinoMegaTest/src/main.cpp` or `Esp_test_1_Jun3/src/main.cpp`. This includes defining pin numbers, types (VCC, GND, INPUT, OUTPUT), and for logic ICs, the gate structures.
    *   For front-end: Potentially adding corresponding entries in `FrontEnd/digitalkit/app/data/icData.ts` (or similar) to ensure the UI can correctly display and interact with the new IC.
*   **Sharing HMI Designs:** If you create improved or alternative Nextion HMI layouts (`.HMI` files), consider sharing them.

(A more formal `CONTRIBUTING.md` file in the repository root would be ideal for detailed guidelines on development setup, coding standards, and testing procedures.)

## 14. Project License

(This section should be updated by the project owner to reflect the chosen open-source license. For example, if MIT License is chosen, a `LICENSE` file containing the MIT License text should be added to the root of the repository.)

**Example Placeholder:**
This project is currently not under a specific open-source license. Please contact the project maintainers for permissions regarding use, modification, or distribution.

OR

This project is licensed under the **MIT License**. See the `LICENSE` file in the root directory of the repository for the full license text.
