/*
  Práctica 8 - Reloj digital (Arduino UNO)
  ------------------------------------------------------------
  El reloj se implementa como una CASCADA DE CONTADORES, igual
  que un reloj digital hecho con circuitos lógicos:

    CLK 1 Hz -> U_seg (mod 10) -> D_seg (mod 6) -> U_min (mod 10)
             -> D_min (mod 6)  -> HORAS (mod 24: U_hr + D_hr)

  Cada contador genera un "acarreo" (carry) cuando regresa a 0,
  y ese acarreo es el pulso de reloj del siguiente contador.

  Salidas:
    - Monitor Serie (siempre)          -> 9600 baudios
    - LCD 16x2 (TIPO_LCD): 2 = LCD normal de 16 pines, 1 = con módulo I2C
    - 6 LEDs: segundos en binario (opcional) -> USE_LEDS 1
    - LED integrado (D13): parpadea a 1 Hz (el "CLK")

  Entradas:
    - D2: botón +HORA    (a GND, se usa INPUT_PULLUP: no requiere resistencia)
    - D3: botón +MINUTO  (a GND, se usa INPUT_PULLUP: no requiere resistencia)
    - Monitor Serie: escribir  T hh:mm:ss  y Enter para fijar la hora

  Base de tiempo:
    - Sin RTC (USE_RTC 0): se usa millis() (cristal del Arduino).
    - Con RTC (USE_RTC 3231 o 1307): se usa el módulo DS3231/DS1307
      por I2C (A4 = SDA, A5 = SCL) y la hora se conserva sin energía.
*/

// ====================== CONFIGURACIÓN ======================
#define TIPO_LCD    2      // 0 = sin LCD
                           // 1 = LCD con módulo I2C atrás (4 pines: GND VCC SDA SCL)
                           // 2 = LCD normal de 16 pines (sin módulo)
#define LCD_ADDR    0x27   // solo I2C: si no muestra nada, prueba 0x3F
#define USE_RTC     0      // 0 = sin RTC, 3231 = DS3231, 1307 = DS1307
#define USE_LEDS    1      // 1 = segundos en binario en 6 LEDs (D4..D9)

// ========================= PINES ===========================
const uint8_t PIN_BTN_HORA = 2;
const uint8_t PIN_BTN_MIN  = 3;
const uint8_t PIN_CLK_LED  = LED_BUILTIN;                 // D13
const uint8_t PIN_LEDS[6]  = {4, 5, 6, 7, 8, 9};          // bit0 .. bit5
// LCD de 16 pines (TIPO_LCD 2): RS, E, D4, D5, D6, D7
// (los pines analógicos A0..A3 funcionan como digitales)
const uint8_t LCD_RS = 12, LCD_E = 11, LCD_D4 = A0, LCD_D5 = A1, LCD_D6 = A2, LCD_D7 = A3;

// ======================= LIBRERÍAS =========================
#if TIPO_LCD == 1 || USE_RTC
  #include <Wire.h>
#endif
#if TIPO_LCD == 1
  #include <LiquidCrystal_I2C.h>   // "LiquidCrystal I2C" de Frank de Brabander
  LiquidCrystal_I2C lcd(LCD_ADDR, 16, 2);
#elif TIPO_LCD == 2
  #include <LiquidCrystal.h>       // ya viene instalada en el Arduino IDE
  LiquidCrystal lcd(LCD_RS, LCD_E, LCD_D4, LCD_D5, LCD_D6, LCD_D7);
#endif
#if USE_RTC
  #include <RTClib.h>              // "RTClib" de Adafruit
  #if USE_RTC == 3231
    RTC_DS3231 rtc;
  #else
    RTC_DS1307 rtc;
  #endif
#endif

// ================ CONTADORES (estado del reloj) ============
// Cada dígito es un contador BCD independiente.
uint8_t uSeg = 0, dSeg = 0;   // unidades (mod 10) y decenas (mod 6) de segundos
uint8_t uMin = 0, dMin = 0;   // unidades (mod 10) y decenas (mod 6) de minutos
uint8_t uHr  = 0, dHr  = 0;   // horas: contador mod 24 formado por dos dígitos BCD

unsigned long tAnterior = 0;  // instante del último pulso de 1 Hz
bool clk = false;             // nivel actual del "reloj" (LED D13)

// Estado de cada botón (se usa para el antirrebote)
struct Boton {
  uint8_t pin;
  bool estable;            // último estado estable (HIGH = suelto)
  bool lectura;            // última lectura cruda
  unsigned long tCambio;   // instante del último cambio crudo
  unsigned long tRepetir;  // siguiente repetición automática (0 = no repetir)
  bool armado;             // true cuando se ha visto el botón suelto al menos una vez
};
Boton btnHora = {PIN_BTN_HORA, HIGH, HIGH, 0, 0, false};
Boton btnMin  = {PIN_BTN_MIN,  HIGH, HIGH, 0, 0, false};

// ================== LÓGICA DE CONTADORES ===================
// Contador de horas mod 24: cuenta 00..23. Cuando llega a 24
// (dHr = 2 y uHr = 4) se reinicia, igual que la compuerta AND
// que detecta "24" en el circuito lógico.
void pulsoHoras() {
  if (++uHr == 10) { uHr = 0; dHr++; }
  if (dHr == 2 && uHr == 4) { dHr = 0; uHr = 0; }
}

// Contador de minutos 00..59. Devuelve true si hubo acarreo (59 -> 00).
bool pulsoMinutos() {
  if (++uMin == 10) {           // U_min mod 10
    uMin = 0;
    if (++dMin == 6) {          // D_min mod 6
      dMin = 0;
      return true;              // carry hacia horas
    }
  }
  return false;
}

// Pulso de 1 Hz: entra a U_seg y se propaga en cascada.
void pulsoSegundos() {
  if (++uSeg == 10) {           // U_seg mod 10
    uSeg = 0;
    if (++dSeg == 6) {          // D_seg mod 6
      dSeg = 0;
      if (pulsoMinutos()) pulsoHoras();
    }
  }
}

uint8_t horas()    { return dHr * 10 + uHr; }
uint8_t minutos()  { return dMin * 10 + uMin; }
uint8_t segundos() { return dSeg * 10 + uSeg; }

void fijarHora(uint8_t h, uint8_t m, uint8_t s) {
  dHr = (h % 24) / 10;  uHr = (h % 24) % 10;
  dMin = (m % 60) / 10; uMin = (m % 60) % 10;
  dSeg = (s % 60) / 10; uSeg = (s % 60) % 10;
#if USE_RTC
  rtc.adjust(DateTime(2026, 1, 1, horas(), minutos(), segundos()));
#endif
  tAnterior = millis();
}

// =================== BOTONES CON ANTIRREBOTE ===============
// Detecta el flanco de bajada (botón presionado) con 40 ms de
// antirrebote. Si se mantiene presionado, repite cada 250 ms.
// Un botón que ya está en LOW al encender (mal conectado) se
// ignora hasta que se suelte, para que no cuente solo.
const unsigned long T_REBOTE   = 40;
const unsigned long T_ESPERA   = 600;   // antes de empezar a repetir
const unsigned long T_REPETIR  = 250;

bool presionado(Boton &b) {
  unsigned long ahora = millis();
  bool l = digitalRead(b.pin);
  if (l != b.lectura) { b.lectura = l; b.tCambio = ahora; }

  if (ahora - b.tCambio >= T_REBOTE && l != b.estable) {
    b.estable = l;
    if (l == HIGH) {                      // se soltó
      b.armado = true;
      b.tRepetir = 0;
    } else if (b.armado) {                // se acaba de presionar
      b.tRepetir = ahora + T_ESPERA;
      return true;
    }
  }
  if (b.estable == LOW && b.tRepetir != 0 && (long)(ahora - b.tRepetir) >= 0) {
    b.tRepetir = ahora + T_REPETIR;       // repetición al mantener
    return true;
  }
  return false;
}

void iniciarBoton(Boton &b, const __FlashStringHelper *nombre) {
  b.lectura = b.estable = digitalRead(b.pin);
  b.armado = (b.estable == HIGH);
  b.tCambio = millis();
  if (!b.armado) {
    Serial.print(F("AVISO: el boton "));
    Serial.print(nombre);
    Serial.println(F(" esta presionado al encender. Revisa su conexion"));
    Serial.println(F("       (usa patas en diagonal). Se ignora hasta soltarlo."));
  }
}

// ========================= SALIDAS =========================
void dos(Print &p, uint8_t v) { if (v < 10) p.print('0'); p.print(v); }

void mostrar() {
  // Monitor serie
  dos(Serial, horas());   Serial.print(':');
  dos(Serial, minutos()); Serial.print(':');
  dos(Serial, segundos());
  Serial.print("   BCD seg = ");
  for (int8_t i = 2; i >= 0; i--) Serial.print(bitRead(dSeg, i));
  Serial.print(' ');
  for (int8_t i = 3; i >= 0; i--) Serial.print(bitRead(uSeg, i));
  Serial.println();

#if TIPO_LCD
  lcd.setCursor(4, 0);
  dos(lcd, horas());   lcd.print(':');
  dos(lcd, minutos()); lcd.print(':');
  dos(lcd, segundos());
  lcd.setCursor(0, 1);
  lcd.print("Seg bin: ");
  for (int8_t i = 5; i >= 0; i--) lcd.print(bitRead(segundos(), i));
#endif

#if USE_LEDS
  uint8_t s = segundos();
  for (uint8_t i = 0; i < 6; i++) digitalWrite(PIN_LEDS[i], bitRead(s, i));
#endif
}

// Lee "T hh:mm:ss" desde el Monitor Serie para fijar la hora.
void leerSerie() {
  if (!Serial.available()) return;
  String linea = Serial.readStringUntil('\n');
  linea.trim();
  int h, m, s;
  if ((linea[0] == 'T' || linea[0] == 't') &&
      sscanf(linea.c_str() + 1, "%d:%d:%d", &h, &m, &s) == 3) {
    fijarHora(h, m, s);
    Serial.println(F("Hora ajustada."));
    mostrar();
  }
}

// ========================== SETUP ==========================
void setup() {
  Serial.begin(9600);
  Serial.setTimeout(50);

  pinMode(PIN_BTN_HORA, INPUT_PULLUP);
  pinMode(PIN_BTN_MIN,  INPUT_PULLUP);
  pinMode(PIN_CLK_LED,  OUTPUT);
#if USE_LEDS
  for (uint8_t i = 0; i < 6; i++) pinMode(PIN_LEDS[i], OUTPUT);
#endif

#if TIPO_LCD == 1
  lcd.init();
  lcd.backlight();
  lcd.clear();
#elif TIPO_LCD == 2
  lcd.begin(16, 2);
  lcd.clear();
#endif

  // ---- Prueba de arranque (1.5 s): todo encendido ----
  // Si algún LED no prende o el LCD no muestra el texto,
  // revisa esa conexión antes de seguir.
  Serial.println(F("Reloj digital - Practica 8"));
  Serial.println(F("Prueba: LEDs D4..D9 y D13 encendidos 1.5 s"));
#if USE_LEDS
  for (uint8_t i = 0; i < 6; i++) digitalWrite(PIN_LEDS[i], HIGH);
#endif
  digitalWrite(PIN_CLK_LED, HIGH);
#if TIPO_LCD
  lcd.setCursor(0, 0); lcd.print(F("  Practica 8"));
  lcd.setCursor(0, 1); lcd.print(F(" Reloj digital"));
#endif
  delay(1500);
#if USE_LEDS
  for (uint8_t i = 0; i < 6; i++) digitalWrite(PIN_LEDS[i], LOW);
#endif
  digitalWrite(PIN_CLK_LED, LOW);
#if TIPO_LCD
  lcd.clear();
#endif

  iniciarBoton(btnHora, F("+HORA (D2)"));
  iniciarBoton(btnMin,  F("+MIN (D3)"));

#if USE_RTC
  if (!rtc.begin()) {
    Serial.println(F("No se encontro el RTC. Revisa SDA(A4)/SCL(A5)."));
    while (true) {}
  }
  #if USE_RTC == 3231
    bool sinHora = rtc.lostPower();
  #else
    bool sinHora = !rtc.isrunning();
  #endif
  if (sinHora) rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
  DateTime t = rtc.now();
  fijarHora(t.hour(), t.minute(), t.second());
#else
  // Sin RTC se arranca con la hora de compilación (aprox.).
  int h, m, s;
  sscanf(__TIME__, "%d:%d:%d", &h, &m, &s);
  fijarHora(h, m, s);
#endif

  Serial.println(F("D2 = +hora, D3 = +minuto, o escribe: T hh:mm:ss"));
  mostrar();
}

// =========================== LOOP ==========================
void loop() {
  unsigned long ahora = millis();

  // ---- Base de tiempo: genera el pulso de 1 Hz ----
#if USE_RTC
  static uint8_t ultimoSeg = 255;
  DateTime t = rtc.now();
  if (t.second() != ultimoSeg) {
    ultimoSeg = t.second();
    dHr = t.hour() / 10;   uHr = t.hour() % 10;
    dMin = t.minute() / 10; uMin = t.minute() % 10;
    dSeg = t.second() / 10; uSeg = t.second() % 10;
    tAnterior = ahora;
    mostrar();
  }
#else
  if (ahora - tAnterior >= 1000) {
    tAnterior += 1000;       // se suma 1000 (no "= ahora") para no acumular error
    pulsoSegundos();
    mostrar();
  }
#endif

  // CLK visible en D13: el conteo ocurre en el FLANCO DE BAJADA
  // (igual que los flip-flops del circuito lógico): bajo justo
  // después del pulso, alto en la segunda mitad del segundo.
  bool nuevoClk = (ahora - tAnterior) >= 500;
  if (nuevoClk != clk) { clk = nuevoClk; digitalWrite(PIN_CLK_LED, clk); }

  // ---- Ajuste de hora con botones ----
  if (presionado(btnHora)) {
    Serial.println(F("[D2] +HORA"));
    pulsoHoras();                       // +1 hora (23 -> 00)
    fijarHora(horas(), minutos(), segundos());
    mostrar();
  }
  if (presionado(btnMin)) {
    Serial.println(F("[D3] +MIN"));
    // +1 minuto SIN acarreo a horas (59 -> 00), y segundos a 00
    if (++uMin == 10) { uMin = 0; if (++dMin == 6) dMin = 0; }
    fijarHora(horas(), minutos(), 0);
    mostrar();
  }

  leerSerie();
}
