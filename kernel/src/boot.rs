use core::arch::asm;

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
        main = sym crate::kernel_main,
        options(noreturn)
    );
}
