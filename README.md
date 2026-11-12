# Práctica 8 · Reloj digital con Arduino UNO

Reloj digital (HH:MM:SS) implementado en un Arduino UNO como una **cascada de contadores BCD**, con dos botones para ajustar la hora.

**Página interactiva:** https://ddamianzr.github.io/practica8-reloj-digital/
(simulador, circuito lógico, tabla de verdad, carta de tiempos, conexiones, código y cuestionario)

## Idea del diseño

```
CLK 1 Hz → U seg (mod 10) → D seg (mod 6) → U min (mod 10) → D min (mod 6) → Horas (mod 24)
```

Cada contador, al regresar a 0, genera un flanco de bajada en su bit más significativo, que es el reloj del siguiente. El sketch reproduce exactamente esa lógica (`pulsoSegundos()`, `pulsoMinutos()`, `pulsoHoras()`), así que el código y el circuito lógico de la página son el mismo diseño.

**Simplificación** (permitida por la profesora):
- Base de tiempo con `millis()` del Arduino (cristal de 16 MHz). El módulo RTC es opcional (`USE_RTC`).
- Botones con `INPUT_PULLUP`: no se necesitan resistencias externas.
- Salida en el Monitor Serie + 6 LEDs con los segundos en binario. El LCD 16×2 I2C es opcional (`USE_LCD_I2C`).

## Material

| Componente | Cant. | Notas |
|---|---|---|
| Arduino UNO + cable USB | 1 | |
| Protoboard | 1 | |
| Pulsadores | 2 | +HORA (D2), +MIN (D3) |
| LEDs | 6 | segundos en binario (D4–D9) |
| Resistencias 220–330 Ω | 6 | una por LED |
| Jumpers | ~20 | |
| LCD 16×2 con módulo I2C | 1 | opcional |
| RTC DS3231 / DS1307 | 1 | opcional |

## Conexiones

| Arduino | Conectar a |
|---|---|
| D2 | pulsador +HORA → GND |
| D3 | pulsador +MIN → GND |
| D4…D9 | 220 Ω → ánodo LED bit0…bit5; cátodos a GND |
| A4 / A5 | SDA / SCL del LCD I2C y del RTC (opcionales) |
| 5V / GND | VCC / GND del LCD y del RTC (opcionales) |

## Uso

1. Abrir `arduino/reloj_digital/reloj_digital.ino` en el Arduino IDE (placa: Arduino UNO).
2. Ajustar al inicio del archivo: `USE_LCD_I2C`, `LCD_ADDR`, `USE_RTC`, `USE_LEDS`.
3. Si se usa LCD o RTC, instalar las librerías **LiquidCrystal I2C** (Frank de Brabander) y/o **RTClib** (Adafruit).
4. Subir y abrir el Monitor Serie a 9600 baudios. Para fijar la hora: `T hh:mm:ss`, o usar los botones.
   - **+HORA**: suma 1 hora (23 → 00).
   - **+MIN**: suma 1 minuto sin acarrear a horas (59 → 00) y pone los segundos en 00.
   - Mantener presionado repite el incremento.

El archivo `arduino/reloj_digital/diagram.json` permite simular el circuito (botones + LEDs) en [Wokwi](https://wokwi.com/projects/new/arduino-uno): crear un proyecto de Arduino UNO, pegar el código en `sketch.ino` y el contenido de `diagram.json`.

## Estructura

```
index.html, styles.css, app.js     página interactiva (GitHub Pages)
arduino/reloj_digital/             sketch de Arduino + diagram.json (Wokwi)
```
