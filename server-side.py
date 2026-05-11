from flask import Flask
from gpiozero import PWMOutputDevice, DigitalOutputDevice

app = Flask(__name__)

# ==========================================
# MOTORES
# ==========================================
RIGHT_RPWM = DigitalOutputDevice(16)
RIGHT_LPWM = DigitalOutputDevice(26)
RIGHT_EN = PWMOutputDevice(12)

LEFT_RPWM = DigitalOutputDevice(25)
LEFT_LPWM = DigitalOutputDevice(24)
LEFT_EN = PWMOutputDevice(13)

SPEED = 0.85

# ==========================================
# HELPERS
# ==========================================
def stop():
    RIGHT_EN.value = 0
    LEFT_EN.value = 0

    RIGHT_RPWM.off()
    RIGHT_LPWM.off()

    LEFT_RPWM.off()
    LEFT_LPWM.off()

def forward():
    RIGHT_RPWM.on()
    RIGHT_LPWM.off()

    LEFT_RPWM.off()
    LEFT_LPWM.on()
    
    RIGHT_EN.value = SPEED
    LEFT_EN.value = SPEED

def backward():
    RIGHT_RPWM.off()
    RIGHT_LPWM.on()

    LEFT_RPWM.on()
    LEFT_LPWM.off()

    RIGHT_EN.value = SPEED
    LEFT_EN.value = SPEED

def left():
    RIGHT_RPWM.on()
    RIGHT_LPWM.off()

    LEFT_RPWM.on()
    LEFT_LPWM.off()

    RIGHT_EN.value = SPEED
    LEFT_EN.value = SPEED

def right():
    RIGHT_RPWM.off()
    RIGHT_LPWM.on()

    LEFT_RPWM.off()
    LEFT_LPWM.on()
    
    RIGHT_EN.value = SPEED
    LEFT_EN.value = SPEED

# ==========================================
# ROUTES (solo para motores)
# ==========================================
@app.route("/forward")
def route_forward():
    forward()
    return "forward"

@app.route("/backward")
def route_backward():
    backward()
    return "backward"

@app.route("/left")
def route_left():
    left()
    return "left"

@app.route("/right")
def route_right():
    right()
    return "right"

@app.route("/stop")
def route_stop():
    stop()
    return "stop"

if __name__ == "__main__":
    stop()
    app.run(host="0.0.0.0", port=5000, threaded=True)