"""
=============================================================================
KANSHI RC INTELLIGENCE SYSTEM - RASPBERRY PI MOTOR CONTROL SERVER
=============================================================================

File: server-side.py
Execution Context: Raspberry Pi 4 (NOT the Desktop PC)
Runtime: Python 3 with Flask and gpiozero

PURPOSE:
This is the embedded server that runs on the Raspberry Pi, serving as the
hardware interface layer for the Kanshi robot. It receives HTTP commands
from the desktop application and translates them into GPIO signals that
control the robot's motors.

IMPORTANT: This is the ONLY file in the Kanshi project that does NOT run
on the desktop PC. All other code executes in the browser or Bun runtime
on the operator's computer.

SYSTEM ARCHITECTURE:

    [Desktop PC Browser]
         ↓ HTTP GET requests (WiFi)
    [Raspberry Pi WiFi Hotspot - 192.168.4.1]
         ↓
    [Flask Server - port 5000]
         ↓
    [GPIO Pins - PWM signals]
         ↓
    [L298N Motor Driver]
         ↓
    [DC Motors - Left & Right]

NETWORK CONFIGURATION:
The Raspberry Pi operates as a standalone WiFi access point (hotspot).
This enables field operation without external network infrastructure.

    - SSID: Configured via hostapd on the Pi
    - Pi IP: 192.168.4.1 (static)
    - DHCP: Pi assigns IPs to connected clients (192.168.4.x)
    - Flask Port: 5000

MOTOR DRIVER CONFIGURATION:
This code assumes an L298N or similar H-bridge motor driver connected
to specific GPIO pins. The L298N provides:
    - Enable pins (EN): PWM speed control (0-100%)
    - Direction pins (IN1, IN2 or RPWM, LPWM): Rotation direction

WIRING DIAGRAM:

    Raspberry Pi GPIO                    L298N Motor Driver
    ═══════════════════════════════════════════════════════════
    GPIO 16 (RIGHT_RPWM) ─────────────→ IN1 (Right Motor)
    GPIO 26 (RIGHT_LPWM) ─────────────→ IN2 (Right Motor)
    GPIO 12 (RIGHT_EN)   ─────────────→ ENA (Right Enable - PWM)

    GPIO 25 (LEFT_RPWM)  ─────────────→ IN3 (Left Motor)
    GPIO 24 (LEFT_LPWM)  ─────────────→ IN4 (Left Motor)
    GPIO 13 (LEFT_EN)    ─────────────→ ENB (Left Enable - PWM)

DIRECTION LOGIC:
    Motor Direction = RPWM and LPWM states

    RPWM=ON,  LPWM=OFF → Forward rotation
    RPWM=OFF, LPWM=ON  → Reverse rotation
    RPWM=OFF, LPWM=OFF → Coast/Stop

MOVEMENT COMMANDS:
    Forward:  Both motors forward
    Backward: Both motors reverse
    Left:     Right forward, Left reverse (tank turn)
    Right:    Right reverse, Left forward (tank turn)
    Stop:     Both motors stop (EN=0)

SAFETY CONSIDERATIONS:
    - Always call stop() on server start to ensure known motor state
    - HTTP server is threaded to handle concurrent requests
    - Motor enable (EN) controls actual power; direction pins alone don't move motors

=============================================================================
"""

from flask import Flask
from gpiozero import PWMOutputDevice, DigitalOutputDevice

# Flask application instance for HTTP server
app = Flask(__name__)

# =============================================================================
# MOTOR GPIO CONFIGURATION
# =============================================================================
#
# Motor control uses the gpiozero library which provides high-level abstractions
# for GPIO control on Raspberry Pi.
#
# PWMOutputDevice: For speed control via PWM (Pulse Width Modulation)
#                  value property accepts 0.0 to 1.0 (0% to 100% duty cycle)
#
# DigitalOutputDevice: For direction control (simple on/off)
#                      on() sets HIGH, off() sets LOW

# -----------------------------------------------------------------------------
# RIGHT MOTOR (typically the robot's right side when viewed from behind)
# -----------------------------------------------------------------------------

# RIGHT_RPWM: Direction pin for "Reverse PWM" or forward rotation
# When ON with RIGHT_LPWM OFF, motor rotates forward
RIGHT_RPWM = DigitalOutputDevice(16)

# RIGHT_LPWM: Direction pin for "Left PWM" or reverse rotation
# When ON with RIGHT_RPWM OFF, motor rotates backward
RIGHT_LPWM = DigitalOutputDevice(26)

# RIGHT_EN: Enable pin with PWM for speed control
# PWM duty cycle determines motor speed (0.0 = stopped, 1.0 = full speed)
RIGHT_EN = PWMOutputDevice(12)

# -----------------------------------------------------------------------------
# LEFT MOTOR (typically the robot's left side when viewed from behind)
# -----------------------------------------------------------------------------

# LEFT_RPWM: Direction pin for forward rotation
LEFT_RPWM = DigitalOutputDevice(25)

# LEFT_LPWM: Direction pin for reverse rotation
LEFT_LPWM = DigitalOutputDevice(24)

# LEFT_EN: Enable pin with PWM for speed control
LEFT_EN = PWMOutputDevice(13)

# -----------------------------------------------------------------------------
# SPEED CONFIGURATION
# -----------------------------------------------------------------------------
# Motor speed as a fraction (0.0 to 1.0)
# 0.85 = 85% duty cycle provides good balance of speed and control
# Higher values increase speed but reduce fine control
# Lower values improve precision but may cause motor stalling
SPEED = 0.85

# =============================================================================
# MOTOR CONTROL HELPER FUNCTIONS
# =============================================================================
#
# These functions encapsulate the GPIO operations needed for each movement.
# Each function sets the appropriate direction pins and enable values.
#
# TIMING CONSIDERATIONS:
# GPIO state changes are nearly instantaneous. No delays are needed between
# setting direction and enable pins. The motor driver handles the actual
# motor physics.

def stop():
    """
    STOP ALL MOTORS

    Immediately halts all motor movement by:
    1. Setting enable pins to 0 (cuts power to motors)
    2. Setting all direction pins to OFF (safe state)

    This is the default/safe state. Called:
    - On server startup (ensures known initial state)
    - When /stop endpoint is called
    - Implicitly when browser sends stop command on key release

    SAFETY: This function should be called whenever movement should cease.
    It's the fail-safe state for the robot.
    """
    # Cut power to both motors by setting enable to 0
    RIGHT_EN.value = 0
    LEFT_EN.value = 0

    # Set all direction pins to OFF for clean state
    # This isn't strictly necessary when EN=0, but ensures
    # predictable behavior when motors are re-enabled
    RIGHT_RPWM.off()
    RIGHT_LPWM.off()
    LEFT_RPWM.off()
    LEFT_LPWM.off()


def forward():
    """
    MOVE FORWARD

    Both motors rotate in the "forward" direction, propelling the robot
    forward. The specific rotation direction depends on motor mounting
    and wiring.

    MOTOR CONFIGURATION:
    - Right motor: RPWM=ON, LPWM=OFF (forward rotation)
    - Left motor:  RPWM=OFF, LPWM=ON (forward rotation)

    Note: The apparent asymmetry (RPWM for right, LPWM for left) is due
    to motor mounting orientation. When motors are mounted facing opposite
    directions, they need opposite signals to move the robot forward.

    SPEED: Both motors run at the configured SPEED value (85%)
    """
    # Set right motor direction to forward
    RIGHT_RPWM.on()
    RIGHT_LPWM.off()

    # Set left motor direction to forward
    # Note: Inverted from right due to mounting orientation
    LEFT_RPWM.off()
    LEFT_LPWM.on()

    # Enable both motors at configured speed
    RIGHT_EN.value = SPEED
    LEFT_EN.value = SPEED


def backward():
    """
    MOVE BACKWARD

    Both motors rotate in the "reverse" direction, moving the robot
    backward. This is the logical inverse of forward().

    MOTOR CONFIGURATION:
    - Right motor: RPWM=OFF, LPWM=ON (reverse rotation)
    - Left motor:  RPWM=ON, LPWM=OFF (reverse rotation)

    SPEED: Both motors run at the configured SPEED value (85%)
    """
    # Set right motor direction to reverse
    RIGHT_RPWM.off()
    RIGHT_LPWM.on()

    # Set left motor direction to reverse
    LEFT_RPWM.on()
    LEFT_LPWM.off()

    # Enable both motors at configured speed
    RIGHT_EN.value = SPEED
    LEFT_EN.value = SPEED


def left():
    """
    TURN LEFT (Tank Turn / Spin Turn)

    The robot rotates counter-clockwise (turns left) by running the
    motors in opposite directions:
    - Right motor: Forward (pushes right side forward)
    - Left motor:  Reverse (pulls left side back)

    This creates a "tank turn" or "spin turn" where the robot pivots
    roughly around its center, allowing turns in place without
    requiring forward/backward movement.

    MOTOR CONFIGURATION:
    - Right motor: RPWM=ON, LPWM=OFF (forward)
    - Left motor:  RPWM=ON, LPWM=OFF (reverse)

    SPEED: Both motors run at equal speed for balanced turning
    """
    # Right motor forward
    RIGHT_RPWM.on()
    RIGHT_LPWM.off()

    # Left motor reverse
    LEFT_RPWM.on()
    LEFT_LPWM.off()

    # Enable both motors at configured speed
    RIGHT_EN.value = SPEED
    LEFT_EN.value = SPEED


def right():
    """
    TURN RIGHT (Tank Turn / Spin Turn)

    The robot rotates clockwise (turns right) by running the motors
    in opposite directions:
    - Right motor: Reverse (pulls right side back)
    - Left motor:  Forward (pushes left side forward)

    This is the mirror image of the left() function.

    MOTOR CONFIGURATION:
    - Right motor: RPWM=OFF, LPWM=ON (reverse)
    - Left motor:  RPWM=OFF, LPWM=ON (forward)

    SPEED: Both motors run at equal speed for balanced turning
    """
    # Right motor reverse
    RIGHT_RPWM.off()
    RIGHT_LPWM.on()

    # Left motor forward
    LEFT_RPWM.off()
    LEFT_LPWM.on()

    # Enable both motors at configured speed
    RIGHT_EN.value = SPEED
    LEFT_EN.value = SPEED


# =============================================================================
# HTTP API ROUTES
# =============================================================================
#
# Flask routes map HTTP endpoints to motor control functions.
#
# All routes use HTTP GET for simplicity:
# - Easy to test in a browser (just visit the URL)
# - Compatible with simple fetch() calls
# - No request body parsing needed
#
# RESPONSE FORMAT:
# Each endpoint returns the command name as plain text.
# This acknowledges receipt but doesn't confirm motor action.
# The simple response keeps latency minimal.
#
# ENDPOINT MAPPING:
#     GET /forward  → forward() → "forward"
#     GET /backward → backward() → "backward"
#     GET /left     → left()     → "left"
#     GET /right    → right()    → "right"
#     GET /stop     → stop()     → "stop"

@app.route("/forward")
def route_forward():
    """
    HTTP endpoint for forward movement.

    URL: http://192.168.4.1:5000/forward
    Method: GET
    Response: "forward" (text/plain)

    Called by the desktop browser when user presses W key or
    clicks the Forward button.
    """
    forward()
    return "forward"


@app.route("/backward")
def route_backward():
    """
    HTTP endpoint for backward movement.

    URL: http://192.168.4.1:5000/backward
    Method: GET
    Response: "backward" (text/plain)

    Called by the desktop browser when user presses S key or
    clicks the Backward button.
    """
    backward()
    return "backward"


@app.route("/left")
def route_left():
    """
    HTTP endpoint for left turn.

    URL: http://192.168.4.1:5000/left
    Method: GET
    Response: "left" (text/plain)

    Called by the desktop browser when user presses A key or
    clicks the Left button.
    """
    left()
    return "left"


@app.route("/right")
def route_right():
    """
    HTTP endpoint for right turn.

    URL: http://192.168.4.1:5000/right
    Method: GET
    Response: "right" (text/plain)

    Called by the desktop browser when user presses D key or
    clicks the Right button.
    """
    right()
    return "right"


@app.route("/stop")
def route_stop():
    """
    HTTP endpoint for stopping all movement.

    URL: http://192.168.4.1:5000/stop
    Method: GET
    Response: "stop" (text/plain)

    Called by the desktop browser when:
    - User releases a movement key
    - User clicks the Stop button
    - Window loses focus (safety stop)
    - Tab becomes hidden (safety stop)

    This is the most frequently called endpoint as it's invoked
    on every key release in the normal control flow.
    """
    stop()
    return "stop"


# =============================================================================
# SERVER STARTUP
# =============================================================================
#
# The main entry point initializes motors to a safe state and starts
# the Flask HTTP server.

if __name__ == "__main__":
    # SAFETY: Ensure motors are stopped on startup
    # This prevents unexpected movement if the server restarts
    # while motors were previously running
    stop()

    # Start Flask server
    #
    # host="0.0.0.0": Listen on all network interfaces
    #     This allows connections from WiFi clients (the desktop PC)
    #     Binding to 127.0.0.1 would only allow localhost connections
    #
    # port=5000: Flask default port
    #     Matches CONTROL_URL in the desktop application
    #
    # threaded=True: Handle requests in separate threads
    #     Prevents request blocking during motor operations
    #     Important for responsive control with rapid command sequences
    #     Note: gpiozero is thread-safe for basic operations
    app.run(host="0.0.0.0", port=5000, threaded=True)
