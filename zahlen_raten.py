import ui
import random

# Farbpalette
C_BG    = '#1a1a2e'
C_INPUT = '#0f3460'
C_LOW   = '#00bcd4'   # Zu niedrig: Cyan
C_HIGH  = '#e94560'   # Zu hoch: Rot/Pink
C_WIN   = '#4caf50'   # Richtig: Grün
C_TEXT  = '#ffffff'
C_DIM   = '#7a8fa6'
C_BTN   = '#e94560'

# Schwierigkeitsstufen: Name, Max-Zahl, Farbe
SCHWIERIGKEITEN = [
    {'name': 'Leicht', 'max':  50,  'farbe': '#4caf50'},
    {'name': 'Mittel', 'max': 100,  'farbe': '#00bcd4'},
    {'name': 'Schwer', 'max': 500,  'farbe': '#e94560'},
]


class ZahlenRatenGame:
    """Zahlen-Ratespiel mit 3 Schwierigkeitsstufen für Pythonista."""

    def __init__(self):
        self.schwierigkeit_idx = 1   # Standard: Mittel
        self._new_game_state()
        self.create_ui()

    # ------------------------------------------------------------------ #
    #  Spielzustand                                                        #
    # ------------------------------------------------------------------ #

    def _new_game_state(self):
        s = SCHWIERIGKEITEN[self.schwierigkeit_idx]
        self.max_zahl      = s['max']
        self.geheime_zahl  = random.randint(1, self.max_zahl)
        self.versuche      = 0
        self.untere_grenze = 1
        self.obere_grenze  = self.max_zahl
        self.game_over     = False
        self.verlauf       = []   # list of (zahl, 'low'|'high'|'win')

    # ------------------------------------------------------------------ #
    #  Schwierigkeit wechseln                                              #
    # ------------------------------------------------------------------ #

    def set_difficulty(self, sender):
        idx = int(sender.name)
        self.schwierigkeit_idx = idx
        self._new_game_state()
        self._refresh_ui()
        self._update_diff_buttons()

    def _update_diff_buttons(self):
        for i, btn in enumerate(self.diff_buttons):
            s = SCHWIERIGKEITEN[i]
            if i == self.schwierigkeit_idx:
                btn.background_color = s['farbe']
                btn.tint_color       = '#ffffff'
            else:
                btn.background_color = C_INPUT
                btn.tint_color       = C_DIM

    # ------------------------------------------------------------------ #
    #  Spiellogik                                                          #
    # ------------------------------------------------------------------ #

    def rate(self, sender):
        if self.game_over:
            return
        text = self.tf_input.text.strip()
        if not text:
            return
        try:
            tipp = int(text)
        except ValueError:
            self._set_hint('Bitte eine ganze Zahl eingeben!', C_DIM)
            return
        if not (1 <= tipp <= self.max_zahl):
            self._set_hint(f'Nur Zahlen von 1 bis {self.max_zahl}!', C_DIM)
            return

        self.versuche += 1
        self.tf_input.text = ''

        if tipp < self.geheime_zahl:
            self.untere_grenze = max(self.untere_grenze, tipp + 1)
            self.verlauf.append((tipp, 'low'))
            self._set_guess(tipp, C_LOW)
            self._set_hint('Zu niedrig!  ↑', C_LOW)
        elif tipp > self.geheime_zahl:
            self.obere_grenze = min(self.obere_grenze, tipp - 1)
            self.verlauf.append((tipp, 'high'))
            self._set_guess(tipp, C_HIGH)
            self._set_hint('Zu hoch!  ↓', C_HIGH)
        else:
            self.verlauf.append((tipp, 'win'))
            self._set_guess(tipp, C_WIN)
            self._set_hint(f'Richtig in {self.versuche} Versuchen! 🎉', C_WIN)
            self.game_over        = True
            self.tf_input.enabled = False
            self.btn_rate.enabled = False

        self.lbl_versuche.text = f'Versuch {self.versuche}'
        self._update_range()
        self._update_history()

    def reset_game(self, sender=None):
        self._new_game_state()
        self._refresh_ui()

    # ------------------------------------------------------------------ #
    #  UI-Helfer                                                           #
    # ------------------------------------------------------------------ #

    def _refresh_ui(self):
        s = SCHWIERIGKEITEN[self.schwierigkeit_idx]
        self.lbl_guess.text        = '?'
        self.lbl_guess.text_color  = C_DIM
        self._set_hint('Was ist die geheime Zahl?', C_DIM)
        self.lbl_versuche.text     = 'Versuch 0'
        self.lbl_subtitle.text     = f'1 bis {s["max"]}'
        self.lbl_range.text        = f'1  ⟷  {s["max"]}'
        self.lbl_range.text_color  = C_DIM
        self.lbl_history.text      = ''
        self.tf_input.text         = ''
        self.tf_input.placeholder  = f'Dein Tipp (1–{s["max"]}) …'
        self.tf_input.enabled      = True
        self.btn_rate.enabled      = True
        self._update_range()

    def _set_guess(self, zahl, color):
        self.lbl_guess.text       = str(zahl)
        self.lbl_guess.text_color = color

    def _set_hint(self, text, color):
        self.lbl_hint.text       = text
        self.lbl_hint.text_color = color

    def _update_range(self):
        lo, hi = self.untere_grenze, self.obere_grenze
        self.lbl_range.text       = f'{lo}  ⟷  {hi}'
        self.lbl_range.text_color = C_DIM if self.game_over else C_LOW

        bw   = self.bar_bg.width
        unit = bw / self.max_zahl
        self.bar_fill.x                = (lo - 1) * unit
        self.bar_fill.width            = max(6, (hi - lo + 1) * unit)
        self.bar_fill.background_color = C_WIN if self.game_over else C_LOW

    def _update_history(self):
        symbols = {'low': '↑', 'high': '↓', 'win': '✓'}
        parts = [f'{z}{symbols[h]}' for z, h in self.verlauf[-7:]]
        self.lbl_history.text = '  '.join(parts)

    # ------------------------------------------------------------------ #
    #  UI aufbauen                                                         #
    # ------------------------------------------------------------------ #

    def create_ui(self):
        sw, sh = ui.get_screen_size()
        s = SCHWIERIGKEITEN[self.schwierigkeit_idx]

        v = ui.View()
        v.name             = 'Zahlen Raten'
        v.background_color = C_BG
        v.frame            = (0, 0, sw, sh)

        def lbl(text, font_name, size, color, y, h):
            l = ui.Label()
            l.text       = text
            l.font       = (font_name, size)
            l.text_color = color
            l.alignment  = ui.ALIGN_CENTER
            l.frame      = (0, y, sw, h)
            l.flex       = 'W'
            v.add_subview(l)
            return l

        # --- Titel ---
        lbl('ZAHLEN  RATEN', 'HelveticaNeue-Light', 13, C_DIM, 44, 20)

        # --- Schwierigkeits-Buttons ---
        m     = 20
        gap   = 8
        btn_w = (sw - m * 2 - gap * 2) / 3
        btn_h = 40
        btn_y = 70
        self.diff_buttons = []
        for i, diff in enumerate(SCHWIERIGKEITEN):
            b = ui.Button()
            b.title          = diff['name']
            b.font           = ('HelveticaNeue-Bold', 14)
            b.corner_radius  = 12
            b.frame          = (m + i * (btn_w + gap), btn_y, btn_w, btn_h)
            b.flex           = 'W'
            b.name           = str(i)
            b.action         = self.set_difficulty
            if i == self.schwierigkeit_idx:
                b.background_color = diff['farbe']
                b.tint_color       = '#ffffff'
            else:
                b.background_color = C_INPUT
                b.tint_color       = C_DIM
            v.add_subview(b)
            self.diff_buttons.append(b)

        # --- Trennlinie ---
        sep = ui.View()
        sep.background_color = '#2a3f6a'
        sep.frame = (sw * 0.15, 118, sw * 0.7, 1)
        sep.flex  = 'W'
        v.add_subview(sep)

        # --- Bereich-Subtitle & Versuchszähler ---
        self.lbl_subtitle = lbl(f'1 bis {s["max"]}',
                                'HelveticaNeue-Bold', 22, C_TEXT, 126, 32)
        self.lbl_versuche = lbl('Versuch 0', 'HelveticaNeue', 13, C_DIM, 162, 20)

        # --- Große Zahlenanzeige ---
        self.lbl_guess = lbl('?', 'HelveticaNeue-Light', 76, C_DIM, 184, 90)

        # --- Hinweistext ---
        self.lbl_hint = lbl('Was ist die geheime Zahl?',
                            'HelveticaNeue-Bold', 17, C_DIM, 278, 28)

        # --- Suchbereich-Label ---
        self.lbl_range = lbl(f'1  ⟷  {s["max"]}',
                             'HelveticaNeue-Light', 14, C_DIM, 310, 22)

        # --- Fortschrittsbalken ---
        bm = 40
        bw = sw - bm * 2
        self.bar_bg = ui.View()
        self.bar_bg.frame            = (bm, 337, bw, 6)
        self.bar_bg.background_color = '#1f3a5a'
        self.bar_bg.corner_radius    = 3
        self.bar_bg.flex             = 'W'
        v.add_subview(self.bar_bg)

        self.bar_fill = ui.View()
        self.bar_fill.frame            = (0, 0, bw, 6)
        self.bar_fill.background_color = C_LOW
        self.bar_fill.corner_radius    = 3
        self.bar_bg.add_subview(self.bar_fill)

        # --- Eingabefeld ---
        inp_m = 30
        inp_w = sw - inp_m * 2

        input_panel = ui.View()
        input_panel.frame            = (inp_m, 358, inp_w, 54)
        input_panel.background_color = C_INPUT
        input_panel.corner_radius    = 16
        input_panel.flex             = 'W'
        v.add_subview(input_panel)

        self.tf_input = ui.TextField()
        self.tf_input.frame            = (16, 5, inp_w - 32, 44)
        self.tf_input.placeholder      = f'Dein Tipp (1–{s["max"]}) …'
        self.tf_input.font             = ('HelveticaNeue', 20)
        self.tf_input.text_color       = C_TEXT
        self.tf_input.tint_color       = C_LOW
        self.tf_input.keyboard_type    = ui.KEYBOARD_NUMBER_PAD
        self.tf_input.alignment        = ui.ALIGN_CENTER
        self.tf_input.background_color = 'clear'
        self.tf_input.bordered         = False
        input_panel.add_subview(self.tf_input)

        # --- Raten-Button ---
        self.btn_rate = ui.Button()
        self.btn_rate.title            = 'Raten  →'
        self.btn_rate.font             = ('HelveticaNeue-Bold', 19)
        self.btn_rate.tint_color       = C_TEXT
        self.btn_rate.background_color = C_INPUT
        self.btn_rate.corner_radius    = 16
        self.btn_rate.frame            = (inp_m, 424, inp_w, 52)
        self.btn_rate.flex             = 'W'
        self.btn_rate.action           = self.rate
        v.add_subview(self.btn_rate)

        # --- Verlauf ---
        lbl('Letzte Versuche', 'HelveticaNeue-Light', 12, C_DIM, 490, 20)
        self.lbl_history = lbl('', 'HelveticaNeue', 15, C_DIM, 512, 24)

        # --- Neustart-Button ---
        restart = ui.Button()
        restart.title            = '↺   Neues Spiel'
        restart.font             = ('HelveticaNeue-Bold', 18)
        restart.tint_color       = C_TEXT
        restart.background_color = C_BTN
        restart.corner_radius    = 16
        restart.frame            = (inp_m, sh - 96, inp_w, 54)
        restart.flex             = 'WT'
        restart.action           = self.reset_game
        v.add_subview(restart)

        v.present('full_screen')


if __name__ == '__main__':
    ZahlenRatenGame()
