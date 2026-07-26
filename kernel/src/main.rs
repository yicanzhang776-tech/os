#![no_std]
#![no_main]

use core::arch::asm;
use core::panic::PanicInfo;

const SBI_CONSOLE_PUTCHAR: usize = 0x01;
const SBI_SYSTEM_RESET: usize = 0x5352_5354;
const SBI_SYSTEM_RESET_SHUTDOWN: usize = 0x0000_0000;
const SBI_SYSTEM_RESET_NO_REASON: usize = 0x0000_0000;

#[link_section = ".bss.stack"]
static mut BOOT_STACK: [u8; 4096 * 16] = [0; 4096 * 16];

#[no_mangle]
#[link_section = ".text.entry"]
unsafe extern "C" fn _start() -> ! {
    asm!(
        "la sp, {stack}",
        "li t0, {size}",
        "add sp, sp, t0",
        "j {main}",
        stack = sym BOOT_STACK,
        size = const 4096 * 16,
        main = sym kernel_main,
        options(noreturn)
    );
}

extern "C" fn kernel_main() -> ! {
    print_line("[ai-os] P0 minimal RISC-V kernel baseline");
    print_line("[ai-os] booted on QEMU virt through OpenSBI");
    print_line("[P0] PASS");
    print_line("[ai-os] shutting down through SBI system reset");
    shutdown()
}

fn print_line(message: &str) {
    for byte in message.bytes() {
        sbi_putchar(byte);
    }
    sbi_putchar(b'\n');
}

fn sbi_putchar(byte: u8) {
    // SAFETY: The RISC-V SBI legacy console call takes the byte in a0 and the
    // extension id in a7. It does not retain pointers into Rust memory.
    unsafe {
        asm!(
            "ecall",
            in("a0") byte as usize,
            in("a7") SBI_CONSOLE_PUTCHAR,
            options(nostack)
        );
    }
}

fn shutdown() -> ! {
    // SAFETY: SBI system reset is the expected machine-level shutdown path
    // under OpenSBI/QEMU. Arguments are plain integer reset type and reason.
    unsafe {
        asm!(
            "ecall",
            in("a0") SBI_SYSTEM_RESET_SHUTDOWN,
            in("a1") SBI_SYSTEM_RESET_NO_REASON,
            in("a6") 0usize,
            in("a7") SBI_SYSTEM_RESET,
            options(noreturn)
        );
    }
}

#[panic_handler]
fn panic(info: &PanicInfo) -> ! {
    print_line("[ai-os] kernel panic");
    if let Some(location) = info.location() {
        print_line(location.file());
    }
    shutdown()
}
