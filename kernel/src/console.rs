use crate::sbi;

pub fn print_line(message: &str) {
    console_write(message);
    console_putchar(b'\n');
}

pub fn console_putchar(byte: u8) {
    // TODO(LAB1-T2): send one byte to the SBI console.
    // Keep this wrapper tiny so the output path remains easy to inspect.
    let _ = byte;
}

pub fn console_write(message: &str) {
    // TODO(LAB1-T2): write every byte in `message` through console_putchar.
    // The temporary fallback keeps the starter bootable without revealing the loop.
    let _ = message;
    raw_print_line("[Lab1-T2] TODO: implement console_write");
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
