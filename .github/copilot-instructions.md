Proyecto: Kanshi RC Intelligence System

Contexto general:
Estoy desarrollando un carrito RC inteligente llamado "Kanshi". La Raspberry Pi 4 actúa únicamente como nodo de hardware remoto. Todo el procesamiento pesado ocurre en la laptop Windows.

Arquitectura:

[Raspberry Pi 4]

- Flask server para control de motores
- mjpg_streamer para transmitir video MJPEG
- Hotspot WiFi autónomo
- Solo recibe instrucciones y transmite video

[Laptop Windows]

- Bun + TypeScript
- Interfaz web principal
- Procesamiento de IA
- YOLO/TensorRT
- Logging de sesiones
- Configuración de modelos
- Controles RC
- Dashboard principal

IMPORTANTE:
La Raspberry Pi NO procesa IA.
La laptop hace TODO el procesamiento.
La Pi solamente:

1. transmite video
2. recibe comandos HTTP

=========================
CONEXIONES DE RED
=================

Video stream MJPEG:
http://192.168.4.1:8080/?action=stream

Servidor Flask de control:
http://192.168.4.1:5000

Endpoints disponibles:
GET /forward
GET /backward
GET /left
GET /right
GET /stop

El frontend debe consumir estos endpoints.

=========================
OBJETIVO
========

Usar los archivos HTML existentes:

- index.html
- AIconfig.html
- SessionLogs.html

como base VISUAL y convertirlos en una aplicación funcional usando:

- Bun
- TypeScript
- módulos limpios
- arquitectura mantenible
- frontend local

NO rehacer la UI desde cero.
La UI ya existe y debe reutilizarse.

=========================
REQUERIMIENTOS
==============

1. VIDEO

- Mostrar stream MJPEG de la Raspberry Pi en tiempo real
- Baja latencia
- Reconexión automática si el stream cae

2. CONTROLES RC

- Soporte WASD
- keydown → enviar comando
- keyup → enviar /stop
- evitar spam de requests repetidas
- soporte para botones UI también

3. CONTROL DE VELOCIDAD
   La UI ya tiene sliders/configuración.
   Implementar lógica frontend para:

- speed percentage
- futuras extensiones

Aunque la Pi actualmente tenga velocidad fija, la arquitectura debe quedar preparada para enviar velocidad configurable posteriormente.

4. AI CONFIGURATION PANEL
   La UI ya incluye configuración del modelo.

Implementar:

- temperatura/confidence sliders
- toggles
- persistencia local
- configuración dinámica

Esto debe conectarse con el pipeline local de YOLO/TensorRT posteriormente.

5. SESSION LOGGING
   Implementar sistema de sesiones:

- guardar timestamps
- guardar eventos
- guardar detecciones futuras
- exportar logs JSON
- listado de sesiones

6. YOLO INTEGRATION PREPARATION
   Archivos existentes:

- yolo26m.engine
- yolo26m.onnx
- yolo26m.pt

Preparar arquitectura modular para:

- ingestión del stream MJPEG
- inferencia futura
- overlays
- detecciones
- recording

NO implementar todavía la inferencia completa si consume demasiado tiempo.
Primero dejar arquitectura limpia.

7. STACK
   Usar:

- Bun
- TypeScript
- frontend modular
- fetch API
- event-driven architecture

NO usar frameworks pesados si no son necesarios.

8. PERFORMANCE
   Priorizar:

- baja latencia
- estabilidad
- simplicidad
- funcionamiento en demo real

9. ESTRUCTURA SUGERIDA
   Crear:

- services/
- controllers/
- ui/
- networking/
- ai/
- logging/
- config/

10. IMPORTANTE
    La aplicación debe funcionar completamente LOCAL en red privada:
    Laptop ↔ Raspberry Pi hotspot

Sin internet.
Sin cloud.
Sin dependencias externas online.

=========================
OBJETIVO FINAL
==============

Abrir la app en la laptop y:

- ver video en tiempo real
- controlar Kanshi con WASD
- ajustar configuraciones IA
- guardar sesiones
- preparar pipeline de visión computacional
- mantener arquitectura escalable y limpia

Priorizar primero:

1. conexión al stream
2. controles
3. estabilidad
4. logging
5. integración IA
