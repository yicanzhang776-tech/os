KERNEL_ELF := target/riscv64gc-unknown-none-elf/debug/ai-os-kernel
QEMU := qemu-system-riscv64

.PHONY: check-env build run test-qemu fmt clean

check-env:
	powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-env.ps1

build:
	cargo build -p ai-os-kernel

run: build
	$(QEMU) -machine virt -nographic -bios default -kernel $(KERNEL_ELF)

test-qemu: build
	powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-qemu.ps1

fmt:
	cargo fmt --all

clean:
	cargo clean
