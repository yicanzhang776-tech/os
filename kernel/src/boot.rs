use core::arch::asm;

const BOOT_STACK_SIZE: usize = 4096 * 64;

#[link_section = ".bss.stack"]
static mut BOOT_STACK: [u8; BOOT_STACK_SIZE] = [0; BOOT_STACK_SIZE];

#[no_mangle]
#[link_section = ".text.entry"]
unsafe extern "C" fn _start() -> ! {
    asm!(
        "la sp, {stack}",
        "li t0, {size}",
        "add sp, sp, t0",
        "j {main}",
        stack = sym BOOT_STACK,
        size = const BOOT_STACK_SIZE,
        main = sym crate::kernel_main,
        options(noreturn)
    );
}
