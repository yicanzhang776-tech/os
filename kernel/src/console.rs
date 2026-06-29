use crate::sbi;

pub fn print_line(message: &str) {
    console_write(message);
    console_putchar(b'\n');
}

pub fn console_putchar(byte: u8) {
    sbi::console_putchar(byte);
}

pub fn console_write(message: &str) {
    for byte in message.bytes() {
        console_putchar(byte);
    }
}

pub fn raw_print_line(message: &str) {
    for byte in message.bytes() {
        raw_putchar(byte);
    }
    raw_putchar(b'\n');
}

fn raw_putchar(byte: u8) {
    sbi::console_putchar(byte);
}
