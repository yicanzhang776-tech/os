mod address;
mod frame_allocator;

pub use address::{PhysAddr, PhysPageNum, PAGE_SIZE};
pub use frame_allocator::{FrameAllocator, FrameAllocatorError, StackFrameAllocator};

/// Conservative upper bound for allocatable memory on the current QEMU virt run.
///
/// OpenSBI reports `Domain0 Next Arg1 = 0x87e00000`, which is where QEMU passes
/// the device tree to the S-mode kernel. Lab3 keeps allocations below that
/// address so the starter does not overwrite boot-provided data.
pub const PHYS_MEMORY_END: PhysAddr = PhysAddr::new(0x87e0_0000);

unsafe extern "C" {
    fn ekernel();
}

/// Return the first address after the linked kernel image.
pub fn kernel_end() -> PhysAddr {
    PhysAddr::new(ekernel as *const () as usize)
}

/// Return whether the address and page-number helpers are implemented.
pub fn address_stage_is_complete() -> bool {
    let aligned = PhysAddr::new(PAGE_SIZE * 3);
    let unaligned = PhysAddr::new(PAGE_SIZE * 3 + 17);
    let page = PhysPageNum::new(5);

    aligned.floor().value() == 3
        && aligned.ceil().value() == 3
        && aligned.page_offset() == 0
        && unaligned.floor().value() == 3
        && unaligned.ceil().value() == 4
        && unaligned.page_offset() == 17
        && page.start_address().value() == PAGE_SIZE * 5
}

/// Return whether the allocator can initialize a range and allocate pages.
pub fn allocation_stage_is_complete() -> bool {
    let mut allocator = StackFrameAllocator::new();
    allocator.init(PhysPageNum::new(10), PhysPageNum::new(12));

    allocator.is_initialized()
        && allocator.bounds() == (PhysPageNum::new(10), PhysPageNum::new(12))
        && allocator.alloc() == Some(PhysPageNum::new(10))
        && allocator.alloc() == Some(PhysPageNum::new(11))
        && allocator.alloc().is_none()
}

/// Run the Lab3 starter checks.
///
/// This function intentionally remains incomplete in `lab3-starter`: it touches
/// the planned APIs so the code builds, then returns false until students
/// implement address rounding and frame allocation.
pub fn starter_is_complete() -> bool {
    if !address_stage_is_complete() || !allocation_stage_is_complete() {
        return false;
    }

    let kernel_end = kernel_end();
    let _kernel_end_value = kernel_end.value();
    let _kernel_end_offset = kernel_end.page_offset();

    let start = kernel_end.ceil();
    let end = PHYS_MEMORY_END.floor();
    let _start_addr = PhysAddr::from(start);
    let _page_size = PAGE_SIZE;
    let _start_value = start.value();

    let mut allocator = StackFrameAllocator::new();
    allocator.init(start, end);
    let _bounds = allocator.bounds();
    let initialized = allocator.is_initialized();
    let allocated = allocator.alloc();
    let released = allocated.map_or(Err(FrameAllocatorError::Unimplemented), |ppn| {
        allocator.dealloc(ppn)
    });
    let reused = allocator.alloc();

    initialized && allocated.is_some() && released.is_ok() && reused == allocated
}
