use crate::sbi;

pub fn print_line(message: &str) {
    print_str(message);
    putchar(b'\n');
}

pub fn print_str(message: &str) {
    for byte in message.bytes() {
        putchar(byte);
    }
}

pub fn print_hex_usize(label: &str, value: usize) {
    const HEX: &[u8; 16] = b"0123456789abcdef";

    print_str(label);
    print_str("0x");

    let mut shift = usize::BITS as usize;
    while shift > 0 {
        shift -= 4;
        let index = (value >> shift) & 0xf;
        putchar(HEX[index]);
    }
    putchar(b'\n');
}

fn putchar(byte: u8) {
    // TODO(student): trace how this function reaches the SBI console call.
    // Lab1 keeps this helper small so students can inspect the full path.
    sbi::console_putchar(byte);
}
