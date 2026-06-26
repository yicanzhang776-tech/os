mod address;
mod frame_allocator;
pub mod page_table;
pub mod virtual_address;

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

/// Run the Lab3 QEMU integration checks.
pub fn run_lab3_checks() -> bool {
    let kernel_end = kernel_end();
    let start = kernel_end.ceil();
    let end = PHYS_MEMORY_END.floor();

    let mut allocator = StackFrameAllocator::new();
    allocator.init(start, end);
    let bounds_are_recorded = allocator.bounds() == (start, end);
    let range_is_valid = allocator.is_initialized()
        && start < end
        && kernel_end.value() < PHYS_MEMORY_END.value()
        && PAGE_SIZE == 4096;

    let first = match allocator.alloc() {
        Some(ppn) => ppn,
        None => return false,
    };
    let second = match allocator.alloc() {
        Some(ppn) => ppn,
        None => return false,
    };
    let third = match allocator.alloc() {
        Some(ppn) => ppn,
        None => return false,
    };

    let pages_are_unique = first != second && second != third && first != third;
    let pages_are_aligned = PhysAddr::from(first).page_offset() == 0
        && PhysAddr::from(second).page_offset() == 0
        && PhysAddr::from(third).page_offset() == 0;
    let pages_avoid_kernel = first >= start && second >= start && third >= start;
    let pages_stay_below_memory_end = first < end && second < end && third < end;
    let rejects_out_of_range = allocator.dealloc(end) == Err(FrameAllocatorError::OutOfRange);
    let releases_second = allocator.dealloc(second).is_ok();
    let rejects_double_free = allocator.dealloc(second) == Err(FrameAllocatorError::DoubleFree);
    let reuses_second = allocator.alloc() == Some(second);

    pages_are_unique
        && pages_are_aligned
        && pages_avoid_kernel
        && pages_stay_below_memory_end
        && bounds_are_recorded
        && range_is_valid
        && rejects_out_of_range
        && releases_second
        && rejects_double_free
        && reuses_second
}

/// Run the Lab4 starter checks.
pub fn run_lab4_starter_checks() -> bool {
    page_table::starter_interfaces_are_present()
}
