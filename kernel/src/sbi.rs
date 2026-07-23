use core::arch::asm;

const SBI_CONSOLE_PUTCHAR: usize = 0x01;
const SBI_SYSTEM_RESET: usize = 0x5352_5354;
const SBI_SYSTEM_RESET_SHUTDOWN: usize = 0x0000_0000;
const SBI_SYSTEM_RESET_NO_REASON: usize = 0x0000_0000;

pub fn console_putchar(byte: u8) {
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

pub fn shutdown() -> ! {
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
