KERNEL_ELF := target/riscv64gc-unknown-none-elf/debug/ai-os-kernel
QEMU := qemu-system-riscv64

.PHONY: check-env build run test-qemu test-lab1 test-lab2 test-lab3 test-lab3-host test-lab4 fmt clean

check-env:
	powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-env.ps1

build:
	cargo build -p ai-os-kernel

run: build
	$(QEMU) -machine virt -nographic -bios default -kernel $(KERNEL_ELF)

test-qemu: build
	powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-qemu.ps1

test-lab1:
	powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab1.ps1

test-lab2:
	powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab2.ps1

test-lab3:
	powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab3.ps1

test-lab3-host:
	cargo test -p ai-os-kernel --lib --target x86_64-pc-windows-msvc

test-lab4:
	powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-lab4.ps1 -ExpectIncomplete

fmt:
	cargo fmt --all

clean:
	cargo clean
