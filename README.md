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
- Salida en LCD 16×2 (de 16 pines o con módulo I2C, `TIPO_LCD`), Monitor Serie y 6 LEDs con los segundos en binario.

## Material

| Componente | Cant. | Notas |
|---|---|---|
| Arduino UNO + cable USB | 1 | |
| Protoboard | 1 | |
| Pulsadores | 2 | +HORA (D2), +MIN (D3) |
| LEDs | 6 | segundos en binario (D4–D9) |
| Resistencias 220–330 Ω | 6 | una por LED |
| Jumpers | ~20 | |
| LCD 16×2 | 1 | de 16 pines o con módulo I2C |
| Resistencia 1 kΩ (o potenciómetro 10 kΩ) | 1 | contraste del LCD de 16 pines |
| Resistencia 220 Ω | 1 | luz de fondo del LCD de 16 pines |
| RTC DS3231 / DS1307 | 1 | opcional |

## Conexiones

| Arduino | Conectar a |
|---|---|
| D2 | pulsador +HORA → GND |
| D3 | pulsador +MIN → GND |
| D4…D9 | 220 Ω → ánodo LED bit0…bit5; cátodos a GND |

**LCD de 16 pines (`TIPO_LCD 2`):** 1 VSS→GND · 2 VDD→5V · 3 V0→1 kΩ a GND (o potenciómetro) · 4 RS→D12 · 5 RW→GND · 6 E→D11 · 7–10 sin conectar · 11 D4→A0 · 12 D5→A1 · 13 D6→A2 · 14 D7→A3 · 15 A→220 Ω→5V · 16 K→GND

**LCD con módulo I2C (`TIPO_LCD 1`):** GND→GND · VCC→5V · SDA→A4 · SCL→A5 (el RTC opcional va en los mismos pines)

## Uso

1. Abrir `arduino/reloj_digital/reloj_digital.ino` en el Arduino IDE (placa: Arduino UNO).
2. Ajustar al inicio del archivo: `TIPO_LCD` (2 = 16 pines, 1 = I2C), `LCD_ADDR`, `USE_RTC`, `USE_LEDS`.
3. El LCD de 16 pines usa `LiquidCrystal` (incluida en el IDE). Si se usa LCD I2C o RTC, instalar las librerías **LiquidCrystal I2C** (Frank de Brabander) y/o **RTClib** (Adafruit).
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
