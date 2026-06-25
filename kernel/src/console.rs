use crate::sbi;

pub fn print_line(message: &str) {
    for byte in message.bytes() {
        putchar(byte);
    }
    putchar(b'\n');
}

fn putchar(byte: u8) {
    // TODO(student): trace how this function reaches the SBI console call.
    // Lab1 keeps this helper small so students can inspect the full path.
    sbi::console_putchar(byte);
}
