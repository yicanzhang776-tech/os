mod address;
mod frame_allocator;
pub mod page_table;
pub mod virtual_address;

pub use address::{PhysAddr, PhysPageNum, PAGE_SIZE};
pub use frame_allocator::{FrameAllocator, FrameAllocatorError, StackFrameAllocator};
pub use page_table::{MemorySet, PTEFlags};
use virtual_address::{VirtAddr, VirtPageNum};

/// Conservative upper bound for allocatable memory on the current QEMU virt run.
///
/// OpenSBI reports `Domain0 Next Arg1 = 0x87e00000`, which is where QEMU passes
/// the device tree to the S-mode kernel. Lab3 keeps allocations below that
/// address so the starter does not overwrite boot-provided data.
pub const PHYS_MEMORY_END: PhysAddr = PhysAddr::new(0x87e0_0000);

unsafe extern "C" {
    fn stext();
    fn etext();
    fn srodata();
    fn erodata();
    fn sdata();
    fn edata();
    fn sbss();
    fn ebss();
    fn ekernel();
}

/// Linked kernel section boundaries used by the Lab4 identity mapping.
pub struct KernelMemoryLayout {
    pub text_start: PhysAddr,
    pub text_end: PhysAddr,
    pub rodata_start: PhysAddr,
    pub rodata_end: PhysAddr,
    pub data_start: PhysAddr,
    pub data_end: PhysAddr,
    pub bss_start: PhysAddr,
    pub bss_end: PhysAddr,
}

/// Return the first address after the linked kernel image.
pub fn kernel_end() -> PhysAddr {
    PhysAddr::new(ekernel as *const () as usize)
}

/// Return the linker-provided kernel memory layout.
pub fn kernel_memory_layout() -> KernelMemoryLayout {
    KernelMemoryLayout {
        text_start: PhysAddr::new(stext as *const () as usize),
        text_end: PhysAddr::new(etext as *const () as usize),
        rodata_start: PhysAddr::new(srodata as *const () as usize),
        rodata_end: PhysAddr::new(erodata as *const () as usize),
        data_start: PhysAddr::new(sdata as *const () as usize),
        data_end: PhysAddr::new(edata as *const () as usize),
        bss_start: PhysAddr::new(sbss as *const () as usize),
        bss_end: PhysAddr::new(ebss as *const () as usize),
    }
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
#[allow(dead_code)]
pub fn run_lab4_starter_checks() -> bool {
    page_table::starter_interfaces_are_present()
}

/// Runtime state for the Lab4 QEMU integration check.
pub struct Lab4Runtime {
    memory_set: MemorySet,
    test_ppn: PhysPageNum,
}

impl Lab4Runtime {
    /// Create runtime state from a built address space and one mapped test page.
    pub const fn new(memory_set: MemorySet, test_ppn: PhysPageNum) -> Self {
        Self {
            memory_set,
            test_ppn,
        }
    }

    /// Activate the Lab4 kernel identity address space.
    pub fn activate(&self) -> usize {
        self.memory_set.activate()
    }

    /// Verify mapping and memory access after paging has been enabled.
    pub fn verify_after_activation(&self) -> bool {
        let test_va = VirtAddr::from(VirtPageNum::new(self.test_ppn.value()));
        let translated = self.memory_set.translate(test_va) == Some(PhysAddr::from(self.test_ppn));
        let data_page_is_not_page_table = !self
            .memory_set
            .page_table()
            .owns_page_table_frame(self.test_ppn);

        // SAFETY: The test page was allocated as a data frame, mapped with
        // identity VA == PA and read/write permissions, and is distinct from
        // all page table frames. Volatile access keeps the integration check
        // visible to the compiler without relying on a heap or allocator.
        let read_write_works = unsafe {
            let ptr = self.test_ppn.start_address().value() as *mut usize;
            ptr.write_volatile(0x4c41_4234);
            ptr.read_volatile() == 0x4c41_4234
        };

        translated && data_page_is_not_page_table && read_write_works
    }
}
