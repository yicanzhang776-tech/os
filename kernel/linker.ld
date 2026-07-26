OUTPUT_ARCH(riscv)
ENTRY(_start)

BASE_ADDRESS = 0x80200000;

SECTIONS
{
    . = BASE_ADDRESS;

    .text : {
        stext = .;
        *(.text.entry)
        *(.text .text.*)
        etext = .;
    }

    .rodata : ALIGN(4K) {
        srodata = .;
        *(.rodata .rodata.*)
        erodata = .;
    }

    .data : ALIGN(4K) {
        sdata = .;
        *(.data .data.*)
        edata = .;
    }

    .bss : ALIGN(4K) {
        sbss = .;
        *(.bss.stack)
        *(.bss .bss.*)
        *(COMMON)
        ebss = .;
    }

    .user.text : ALIGN(4K) {
        suser_text = .;
        *(.user.text)
        . = ALIGN(4K);
        euser_text = .;
    }

    .user.stack (NOLOAD) : ALIGN(4K) {
        suser_stack = .;
        . += 8K;
        euser_stack = .;
    }

    . = ALIGN(4K);
    ekernel = .;

    /DISCARD/ : {
        *(.eh_frame)
    }
}
