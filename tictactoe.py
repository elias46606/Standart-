import ui

# --- Modernes Dunkel-Theme ---
C_BG     = '#1a1a2e'   # Hintergrund: tiefes Dunkelblau
C_GRID   = '#16213e'   # Spielfeld
C_CELL   = '#0f3460'   # Zellenfarbe
C_CELL_X = '#1c2e50'   # Zelle nach X-Zug (leicht heller)
C_CELL_O = '#0e2a35'   # Zelle nach O-Zug (leicht heller)
C_X      = '#e94560'   # X: Rot/Pink
C_O      = '#00bcd4'   # O: Cyan/Türkis
C_TEXT   = '#ffffff'   # Weißer Text
C_DIM    = '#7a8fa6'   # Gedimmter Text
C_BTN    = '#e94560'   # Neustart-Button


class TicTacToeGame:
    """Tic-Tac-Toe mit modernem dunklen Design für Pythonista."""

    def __init__(self):
        self.board = [[''] * 3 for _ in range(3)]
        self.current_player = 'X'
        self.game_over = False
        self.cell_buttons = {}
        self.create_ui()

    # ------------------------------------------------------------------ #
    #  Spiellogik                                                          #
    # ------------------------------------------------------------------ #

    def _player_color(self, player=None):
        return C_X if (player or self.current_player) == 'X' else C_O

    def _check_win(self):
        p, b = self.current_player, self.board
        for i in range(3):
            if all(b[i][j] == p for j in range(3)):
                return True
            if all(b[j][i] == p for j in range(3)):
                return True
        return (b[0][0] == b[1][1] == b[2][2] == p or
                b[0][2] == b[1][1] == b[2][0] == p)

    def _check_draw(self):
        return all(cell != '' for row in self.board for cell in row)

    # ------------------------------------------------------------------ #
    #  UI-Aktionen                                                         #
    # ------------------------------------------------------------------ #

    def _update_status(self, main_text, sub_text, color):
        self.lbl_player.text = main_text
        self.lbl_player.text_color = color
        self.lbl_status.text = sub_text
        self.lbl_status.text_color = color if sub_text != 'ist am Zug' else C_DIM

    def reset_game(self, sender=None):
        self.board = [[''] * 3 for _ in range(3)]
        self.current_player = 'X'
        self.game_over = False
        for (row, col), btn in self.cell_buttons.items():
            btn.title = ''
            btn.enabled = True
            btn.tint_color = C_TEXT
            btn.background_color = C_CELL
        self._update_status('Spieler X', 'ist am Zug', C_X)

    def button_action(self, sender):
        if self.game_over:
            return
        _, r, c = sender.name.split('_')
        row, col = int(r), int(c)
        if self.board[row][col]:
            return

        color = self._player_color()
        self.board[row][col] = self.current_player
        sender.title = self.current_player
        sender.tint_color = color
        sender.background_color = C_CELL_X if self.current_player == 'X' else C_CELL_O
        sender.enabled = False

        if self._check_win():
            self._update_status(
                f'Spieler {self.current_player}', 'GEWINNT! 🎉', color
            )
            self.game_over = True
            for btn in self.cell_buttons.values():
                btn.enabled = False
        elif self._check_draw():
            self._update_status('Unentschieden', '🤝', C_DIM)
            self.game_over = True
        else:
            self.current_player = 'O' if self.current_player == 'X' else 'X'
            color = self._player_color()
            self._update_status(f'Spieler {self.current_player}', 'ist am Zug', color)

    # ------------------------------------------------------------------ #
    #  UI aufbauen                                                         #
    # ------------------------------------------------------------------ #

    def create_ui(self):
        sw, sh = ui.get_screen_size()

        v = ui.View()
        v.name = 'Tic Tac Toe'
        v.background_color = C_BG
        v.frame = (0, 0, sw, sh)
        self.main_view = v

        # Titel
        lbl_title = ui.Label()
        lbl_title.text = 'TIC  TAC  TOE'
        lbl_title.font = ('HelveticaNeue-Light', 13)
        lbl_title.text_color = C_DIM
        lbl_title.alignment = ui.ALIGN_CENTER
        lbl_title.frame = (0, 44, sw, 20)
        lbl_title.flex = 'W'
        v.add_subview(lbl_title)

        # Spieler-Anzeige (groß, farbig)
        self.lbl_player = ui.Label()
        self.lbl_player.text = 'Spieler X'
        self.lbl_player.text_color = C_X
        self.lbl_player.font = ('HelveticaNeue-Bold', 30)
        self.lbl_player.alignment = ui.ALIGN_CENTER
        self.lbl_player.frame = (0, 72, sw, 42)
        self.lbl_player.flex = 'W'
        v.add_subview(self.lbl_player)

        # Statuszeile darunter
        self.lbl_status = ui.Label()
        self.lbl_status.text = 'ist am Zug'
        self.lbl_status.text_color = C_DIM
        self.lbl_status.font = ('HelveticaNeue', 16)
        self.lbl_status.alignment = ui.ALIGN_CENTER
        self.lbl_status.frame = (0, 114, sw, 24)
        self.lbl_status.flex = 'W'
        v.add_subview(self.lbl_status)

        # Trennlinie
        sep = ui.View()
        sep.background_color = '#2a3f6a'
        sep.frame = (sw * 0.15, 146, sw * 0.7, 1)
        sep.flex = 'W'
        v.add_subview(sep)

        # Spielfeld-Container
        grid_size = int(min(sw * 0.88, sh * 0.52))
        grid_size = max(270, min(grid_size, 380))
        gx = (sw - grid_size) / 2
        gy = 155 + (sh - 265 - grid_size) / 2

        grid = ui.View()
        grid.frame = (gx, gy, grid_size, grid_size)
        grid.background_color = C_GRID
        grid.corner_radius = 24
        grid.flex = 'LRTB'
        v.add_subview(grid)

        pad = 7
        cell_size = grid_size / 3
        font_size = max(38, int(cell_size * 0.60))

        for row in range(3):
            for col in range(3):
                btn = ui.Button()
                btn.frame = (
                    col * cell_size + pad,
                    row * cell_size + pad,
                    cell_size - pad * 2,
                    cell_size - pad * 2,
                )
                btn.background_color = C_CELL
                btn.corner_radius = 16
                btn.font = ('HelveticaNeue-Light', font_size)
                btn.tint_color = C_TEXT
                btn.name = f'cell_{row}_{col}'
                btn.action = self.button_action
                grid.add_subview(btn)
                self.cell_buttons[(row, col)] = btn

        # Neustart-Button
        margin = 30
        restart = ui.Button()
        restart.title = '↺   Neues Spiel'
        restart.font = ('HelveticaNeue-Bold', 18)
        restart.tint_color = C_TEXT
        restart.background_color = C_BTN
        restart.corner_radius = 16
        restart.frame = (margin, sh - 96, sw - margin * 2, 54)
        restart.flex = 'WT'
        restart.action = self.reset_game
        v.add_subview(restart)

        v.present('full_screen')


if __name__ == '__main__':
    TicTacToeGame()
