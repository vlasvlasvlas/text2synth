# TEXT2SYNTH

Sintetizador retro de texto a voz con interfaz web tipo terminal, backend Flask y motor de audio Web Audio multipista.

`TEXT2SYNTH` convierte texto escrito en voces robotizadas, loops y texturas experimentales inspiradas en sintetizadores de voz clásicos.

![TEXT2SYNTH interface](screenshot.png)

## Qué incluye hoy

- Hasta 4 canales independientes.
- Motor de audio compartido con efectos por canal.
- Motor `SAM` (estilo 1982) vía `samtts`.
- Motor `say` de macOS (cuando está disponible en el sistema).
- Presets de voz y melodía configurables desde `config.yaml`.
- Modos de melodía para mapear palabras/frases a notas.

## Motores de síntesis soportados

Actualmente hay **2 motores**:

1. `sam` (cross-platform): funciona en macOS, Linux y Windows porque depende del paquete Python `samtts`.
2. `say` (solo macOS): usa binarios del sistema (`say` + `afconvert`).

### Enlaces de referencia

- `samtts` (PyPI): [https://pypi.org/project/samtts/](https://pypi.org/project/samtts/)
- S.A.M. (contexto histórico): [https://en.wikipedia.org/wiki/Software_Automatic_Mouth](https://en.wikipedia.org/wiki/Software_Automatic_Mouth)
- `say` (Apple): [https://ss64.com/mac/say.html](https://ss64.com/mac/say.html)
- `pyttsx3` (Python TTS offline): [https://pypi.org/project/pyttsx3/](https://pypi.org/project/pyttsx3/)
- `eSpeak NG` (motor TTS): [https://github.com/espeak-ng/espeak-ng](https://github.com/espeak-ng/espeak-ng)

## Reemplazo multiplataforma de `say`

Si querés un reemplazo de `say` que sea usable en Linux/Windows/macOS desde Python, la opción más parecida a nivel integración es:

- `pyttsx3` como capa Python.
- Backend del sistema por OS:
  - macOS: NSSpeechSynthesizer
  - Windows: SAPI5
  - Linux: eSpeak / eSpeak NG

Esto permite mantener un flujo local/offline de TTS similar al modelo de `say` (motor del sistema + selección de voz).

### Recomendación práctica para este proyecto

1. Mantener `sam` como motor retro principal.
2. Mantener `say` solo para macOS.
3. Agregar en una próxima iteración un engine `system` o `pyttsx3` para Linux/Windows (y opcionalmente también macOS), para tener un camino multiplataforma único.

### Dependencias sugeridas por OS para ese reemplazo

- Linux (Debian/Ubuntu): `sudo apt install espeak-ng`
- Windows: usar voces SAPI5 ya instaladas en el sistema.
- macOS: usar NSSpeechSynthesizer vía `pyttsx3` o seguir con `say`.

Nota: este README deja documentada la alternativa; la implementación en código del engine `pyttsx3/system` todavía no está incluida.

## Historia y orígenes

El carácter sonoro de este proyecto nace de la síntesis clásica por software:

- **S.A.M. (1982)**: "Software Automatic Mouth", uno de los sintetizadores de voz por software más icónicos de la era 8-bit.
- **Voces de sistema macOS (`say`)**: capa adicional para contraste entre timbres retro y voces del sistema operativo.
- **Diseño del proyecto**: mezclar TTS clásico con procesamiento musical en tiempo real (melodía, bend, LFO, filtro, delay, drone) para crear un instrumento vocal, no solo un lector de texto.

## Dependencias de Python (importante)

Archivo actual: `requirements.txt`

- `flask`: servidor web/API.
- `flask-cors`: CORS para frontend local.
- `pyyaml`: lectura de presets y defaults desde `config.yaml`.
- `samtts`: motor principal de síntesis retro (S.A.M.) en Python.

## Dependencias del sistema operativo

### macOS

Requerido:

- Python 3.8+
- `venv`
- (opcional) Homebrew

Notas:

- `sam` funciona con `pip install -r requirements.txt`.
- `say` funciona porque viene con macOS (`say` y `afconvert` ya instalados normalmente).

Instalación:

```bash
git clone https://github.com/vlasvlasvlas/text2synth.git
cd text2synth
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Ejecución:

```bash
source venv/bin/activate
python server.py
```

Abrir en navegador:

```text
http://localhost:5050
```

### Linux

Requerido:

- Python 3.8+
- `python3-venv`
- `pip`

Instalación (Debian/Ubuntu ejemplo):

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip
git clone https://github.com/vlasvlasvlas/text2synth.git
cd text2synth
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Ejecución:

```bash
source venv/bin/activate
python server.py
```

Limitaciones en Linux:

- `sam`: sí disponible.
- `say`: no disponible (es exclusivo de macOS).

### Windows

Requerido:

- Python 3.8+ (instalado desde python.org)
- PowerShell o CMD

Instalación (PowerShell):

```powershell
git clone https://github.com/vlasvlasvlas/text2synth.git
cd text2synth
py -3 -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Ejecución:

```powershell
.\venv\Scripts\Activate.ps1
python server.py
```

Abrir en navegador:

```text
http://localhost:5050
```

Limitaciones en Windows:

- `sam`: sí disponible.
- `say`: no disponible (es exclusivo de macOS).

## Uso básico

1. Escribí texto en un canal.
2. Presioná `Enter` para sintetizar y reproducir.
3. Usá `[+]` para agregar hasta 4 canales.
4. Ajustá controles del sidebar del canal activo.
5. Probá `MELODY` para seguimiento de notas por palabra o frase.

## API

### `GET /api/config`

Devuelve configuración completa de `config.yaml`.

### `GET /api/voices`

Devuelve voces disponibles para cada motor:

- `say`: voces del sistema (macOS).
- `sam`: presets definidos en `config.yaml`.

### `POST /api/synthesize`

Sintetiza texto y devuelve WAV.

Ejemplo `sam`:

```json
{
  "text": "I feel fantastic",
  "engine": "sam",
  "speed": 60,
  "pitch": 40,
  "mouth": 150,
  "throat": 200,
  "sing_mode": true
}
```

Ejemplo `say` (solo macOS):

```json
{
  "text": "hola mundo",
  "engine": "say",
  "voice": "Monica",
  "rate": 175
}
```

## Configuración (`config.yaml`)

`config.yaml` controla:

- Presets SAM (`sam_presets`)
- Voces sugeridas de macOS (`say_preferred_voices`)
- Presets de melodía (`melody_presets`)
- Defaults iniciales de motor, efectos, loop y melodía

## Posibilidades de expansión

Además de TTS básico, el proyecto ya está orientado a:

- Performance en vivo por canales
- Diseño sonoro vocal retro/uncanny
- Secuencias melódicas por texto
- Looping de frases con variación de preset/voz
- Integración futura de más motores vía un selector único de engine en backend

## Próximos pasos: motores clásicos/antiguos para sumar

Motores históricos que podés evaluar para ampliar el proyecto:

1. **eSpeak / eSpeak NG** (descendiente moderno de eSpeak clásico)
   - [https://github.com/espeak-ng/espeak-ng](https://github.com/espeak-ng/espeak-ng)
2. **Festival** (University of Edinburgh, clásico en Linux)
   - [https://www.cstr.ed.ac.uk/projects/festival/](https://www.cstr.ed.ac.uk/projects/festival/)
3. **Flite** (CMU, runtime liviano derivado de Festival)
   - [https://cmuflite.org/](https://cmuflite.org/)
4. **MBROLA** (concatenativo, muy usado en TTS clásico)
   - [https://github.com/numediart/MBROLA](https://github.com/numediart/MBROLA)
5. **DECtalk (vías emulación/proyectos comunitarios)**
   - [https://dectalk.github.io/](https://dectalk.github.io/)

Siguiente iteración recomendada: integrar `pyttsx3` + `espeak-ng` como engine `system` multiplataforma, y dejar `say` como atajo específico de macOS.

## Licencia

MIT. Ver `LICENSE`.
