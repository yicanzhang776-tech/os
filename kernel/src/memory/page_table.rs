#![allow(dead_code)]

#[cfg(target_arch = "riscv64")]
use core::arch::asm;
#[cfg(not(target_arch = "riscv64"))]
use core::mem::MaybeUninit;
use core::ops::BitOr;

use super::{
    virtual_address::{identity_physical_address, VirtAddr, VirtPageNum, SV39_LEVELS},
    FrameAllocator, PhysAddr, PhysPageNum, StackFrameAllocator, PAGE_SIZE,
};

/// Number of entries in one Sv39 page table page.
pub const PAGE_TABLE_ENTRIES: usize = 512;
/// Sv39 mode value used in the satp register.
pub const SATP_MODE_SV39: usize = 8;
/// Fixed number of page-table pages owned by one Lab4 address space.
pub const MAX_PAGE_TABLE_FRAMES: usize = 8;

const PTE_FLAG_MASK: usize = 0x3ff;
const PTE_PPN_MASK: usize = (1usize << 44) - 1;

/// Minimal bitflag wrapper for Sv39 page table entry flags.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PTEFlags {
    bits: usize,
}

impl PTEFlags {
    /// Empty page table entry flags.
    pub const EMPTY: Self = Self::new(0);
    /// Valid bit.
    pub const V: Self = Self::new(1 << 0);
    /// Read permission.
    pub const R: Self = Self::new(1 << 1);
    /// Write permission.
    pub const W: Self = Self::new(1 << 2);
    /// Execute permission.
    pub const X: Self = Self::new(1 << 3);
    /// User-accessible page.
    pub const U: Self = Self::new(1 << 4);
    /// Global mapping.
    pub const G: Self = Self::new(1 << 5);
    /// Accessed bit.
    pub const A: Self = Self::new(1 << 6);
    /// Dirty bit.
    pub const D: Self = Self::new(1 << 7);

    /// Create flags from raw bits.
    pub const fn new(bits: usize) -> Self {
        Self { bits }
    }

    /// Return the raw flag bits.
    pub const fn bits(self) -> usize {
        self.bits
    }

    /// Return whether all bits in `other` are set.
    pub const fn contains(self, other: Self) -> bool {
        (self.bits & other.bits) == other.bits
    }

    /// Return the union of two flag sets.
    pub const fn union(self, other: Self) -> Self {
        Self::new(self.bits | other.bits)
    }
}

impl BitOr for PTEFlags {
    type Output = Self;

    fn bitor(self, rhs: Self) -> Self::Output {
        self.union(rhs)
    }
}

/// A raw Sv39 page table entry.
#[repr(transparent)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PageTableEntry {
    bits: usize,
}

impl PageTableEntry {
    /// Create an empty invalid page table entry.
    pub const fn empty() -> Self {
        Self { bits: 0 }
    }

    /// Create a page table entry from a physical page number and flags.
    pub const fn new(ppn: PhysPageNum, flags: PTEFlags) -> Self {
        Self {
            bits: (ppn.value() << 10) | flags.bits(),
        }
    }

    /// Return the raw page table entry bits.
    pub const fn bits(self) -> usize {
        self.bits
    }

    /// Return this entry's flags.
    pub const fn flags(self) -> PTEFlags {
        PTEFlags::new(self.bits & PTE_FLAG_MASK)
    }

    /// Return whether this PTE has the valid bit set.
    pub const fn is_valid(self) -> bool {
        self.flags().contains(PTEFlags::V)
    }

    /// Return whether this PTE is a leaf mapping.
    pub const fn is_leaf(self) -> bool {
        let flags = self.flags();
        flags.contains(PTEFlags::R) || flags.contains(PTEFlags::W) || flags.contains(PTEFlags::X)
    }

    /// Extract the physical page number encoded in this PTE.
    pub const fn ppn(self) -> PhysPageNum {
        PhysPageNum::new((self.bits >> 10) & PTE_PPN_MASK)
    }
}

/// Errors returned by the Lab4 page table implementation.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PageTableError {
    /// The requested mapping already exists.
    AlreadyMapped,
    /// The requested mapping does not exist.
    NotMapped,
    /// The Lab3 frame allocator had no more physical pages.
    OutOfPhysicalFrames,
    /// The fixed Lab4 page-table-page ownership array is full.
    OutOfPageTableFrames,
    /// A PTE points at a page table frame this object does not own.
    MissingPageTableFrame,
    /// A non-leaf level unexpectedly contained a leaf mapping.
    UnexpectedLeaf,
}

#[derive(Clone, Copy)]
struct OwnedPageTablePage {
    ppn: PhysPageNum,
    entries: [PageTableEntry; PAGE_TABLE_ENTRIES],
}

impl OwnedPageTablePage {
    const fn empty() -> Self {
        Self {
            ppn: PhysPageNum::new(0),
            entries: [PageTableEntry::empty(); PAGE_TABLE_ENTRIES],
        }
    }

    const fn new(ppn: PhysPageNum) -> Self {
        Self {
            ppn,
            entries: [PageTableEntry::empty(); PAGE_TABLE_ENTRIES],
        }
    }
}

#[cfg(target_arch = "riscv64")]
static mut KERNEL_PAGE_TABLE_STORAGE: [OwnedPageTablePage; MAX_PAGE_TABLE_FRAMES] =
    [OwnedPageTablePage::empty(); MAX_PAGE_TABLE_FRAMES];

#[derive(Clone, Copy)]
struct PteLocation {
    page_index: usize,
    entry_index: usize,
}

/// Teaching-oriented Sv39 page table with fixed ownership storage.
pub struct PageTable {
    allocator: StackFrameAllocator,
    #[cfg(target_arch = "riscv64")]
    pages: *mut OwnedPageTablePage,
    #[cfg(not(target_arch = "riscv64"))]
    pages: [MaybeUninit<OwnedPageTablePage>; MAX_PAGE_TABLE_FRAMES],
    page_count: usize,
}

impl PageTable {
    /// Allocate a new root page table page from the Lab3 frame allocator.
    pub fn new(mut allocator: StackFrameAllocator) -> Result<Self, PageTableError> {
        let root_ppn = allocator
            .alloc()
            .ok_or(PageTableError::OutOfPhysicalFrames)?;

        #[cfg(target_arch = "riscv64")]
        {
            let pages: *mut OwnedPageTablePage =
                core::ptr::addr_of_mut!(KERNEL_PAGE_TABLE_STORAGE).cast();
            // SAFETY: Lab4 runs on one hart and builds one kernel address space.
            // The static storage is exclusively owned by this PageTable value.
            unsafe {
                pages.add(0).write(OwnedPageTablePage::new(root_ppn));
            }

            Ok(Self {
                allocator,
                pages,
                page_count: 1,
            })
        }

        #[cfg(not(target_arch = "riscv64"))]
        {
            let mut pages = [const { MaybeUninit::uninit() }; MAX_PAGE_TABLE_FRAMES];
            pages[0].write(OwnedPageTablePage::new(root_ppn));

            Ok(Self {
                allocator,
                pages,
                page_count: 1,
            })
        }
    }

    /// Return the root page table physical page number.
    pub fn root_ppn(&self) -> PhysPageNum {
        self.page(0).ppn
    }

    /// Return the root table entries.
    pub fn entries(&self) -> &[PageTableEntry; PAGE_TABLE_ENTRIES] {
        &self.page(0).entries
    }

    /// Return how many page-table pages this address space owns.
    pub const fn owned_page_count(&self) -> usize {
        self.page_count
    }

    /// Return whether a PPN belongs to this page table object.
    pub fn owns_page_table_frame(&self, ppn: PhysPageNum) -> bool {
        self.page_index(ppn).is_some()
    }

    /// Find a page table entry, creating intermediate tables when needed.
    pub fn find_pte_create(&mut self, vpn: VirtPageNum) -> Option<&mut PageTableEntry> {
        let location = self.find_pte_location_create(vpn).ok()?;
        Some(self.entry_mut(location))
    }

    /// Return a mapped PTE by value for tests and diagnostics.
    pub fn find_pte(&self, vpn: VirtPageNum) -> Option<PageTableEntry> {
        let location = self.find_pte_location(vpn)?;
        Some(self.entry(location))
    }

    /// Map one virtual page to one physical page with flags.
    pub fn map(
        &mut self,
        vpn: VirtPageNum,
        ppn: PhysPageNum,
        flags: PTEFlags,
    ) -> Result<(), PageTableError> {
        let location = self.find_pte_location_create(vpn)?;
        let pte = self.entry(location);
        if pte.is_valid() {
            return Err(PageTableError::AlreadyMapped);
        }

        *self.entry_mut(location) = PageTableEntry::new(ppn, flags | PTEFlags::V);
        Ok(())
    }

    /// Remove one virtual page mapping.
    pub fn unmap(&mut self, vpn: VirtPageNum) -> Result<(), PageTableError> {
        let location = self
            .find_pte_location(vpn)
            .ok_or(PageTableError::NotMapped)?;
        let pte = self.entry(location);
        if !pte.is_valid() || !pte.is_leaf() {
            return Err(PageTableError::NotMapped);
        }

        *self.entry_mut(location) = PageTableEntry::empty();
        Ok(())
    }

    /// Translate a virtual address to a physical address.
    pub fn translate(&self, va: VirtAddr) -> Option<PhysAddr> {
        let location = self.find_pte_location(va.floor())?;
        let pte = self.entry(location);
        if !pte.is_valid() || !pte.is_leaf() {
            return None;
        }

        Some(PhysAddr::new(
            pte.ppn().start_address().value() + va.page_offset(),
        ))
    }

    /// Map a half-open physical range as identity-mapped virtual pages.
    pub fn map_identity_range(
        &mut self,
        start: PhysAddr,
        end: PhysAddr,
        flags: PTEFlags,
    ) -> Result<(), PageTableError> {
        if start.value() >= end.value() {
            return Ok(());
        }

        let mut current = start.floor();
        let end_ppn = end.ceil();
        while current < end_ppn {
            self.map(VirtPageNum::new(current.value()), current, flags)?;
            current = PhysPageNum::new(current.value() + 1);
        }
        Ok(())
    }

    /// Allocate one data frame that is not owned as a page table frame.
    pub fn alloc_data_frame(&mut self) -> Result<PhysPageNum, PageTableError> {
        self.allocator
            .alloc()
            .ok_or(PageTableError::OutOfPhysicalFrames)
    }

    /// Build the satp value that activates this root page table.
    pub fn satp(&self) -> usize {
        make_satp(self.root_ppn())
    }

    /// Copy the simulated page table pages into their real physical frames.
    ///
    /// On the host test target this is intentionally a no-op; tests inspect the
    /// pure array model and never dereference RISC-V physical addresses.
    pub fn sync_to_physical(&self) {
        #[cfg(target_arch = "riscv64")]
        {
            let mut index = 0;
            while index < self.page_count {
                let page = self.page(index);
                // SAFETY: Before paging is enabled, the kernel runs with bare
                // physical addressing. Page table frames were allocated from the
                // Lab3 allocator after `ekernel`, so writing one 4 KiB PTE array
                // to each frame does not overlap the kernel image or stack.
                unsafe {
                    let dst = page.ppn.start_address().value() as *mut PageTableEntry;
                    core::ptr::write_bytes(dst, 0, PAGE_TABLE_ENTRIES);
                    core::ptr::copy_nonoverlapping(page.entries.as_ptr(), dst, PAGE_TABLE_ENTRIES);
                }
                index += 1;
            }
        }
    }

    fn find_pte_location_create(
        &mut self,
        vpn: VirtPageNum,
    ) -> Result<PteLocation, PageTableError> {
        let indexes = vpn.indexes();
        let mut page_index = 0;

        for level in (1..SV39_LEVELS).rev() {
            let entry_index = indexes[level];
            let entry = self.page(page_index).entries[entry_index];

            if !entry.is_valid() {
                let child_index = self.alloc_page_table_page()?;
                let child_ppn = self.page(child_index).ppn;
                self.page_mut(page_index).entries[entry_index] =
                    PageTableEntry::new(child_ppn, PTEFlags::V);
                page_index = child_index;
            } else if entry.is_leaf() {
                return Err(PageTableError::UnexpectedLeaf);
            } else {
                page_index = self
                    .page_index(entry.ppn())
                    .ok_or(PageTableError::MissingPageTableFrame)?;
            }
        }

        Ok(PteLocation {
            page_index,
            entry_index: indexes[0],
        })
    }

    fn find_pte_location(&self, vpn: VirtPageNum) -> Option<PteLocation> {
        let indexes = vpn.indexes();
        let mut page_index = 0;

        for level in (1..SV39_LEVELS).rev() {
            let entry = self.page(page_index).entries[indexes[level]];
            if !entry.is_valid() || entry.is_leaf() {
                return None;
            }
            page_index = self.page_index(entry.ppn())?;
        }

        Some(PteLocation {
            page_index,
            entry_index: indexes[0],
        })
    }

    fn alloc_page_table_page(&mut self) -> Result<usize, PageTableError> {
        if self.page_count == MAX_PAGE_TABLE_FRAMES {
            return Err(PageTableError::OutOfPageTableFrames);
        }

        let ppn = self
            .allocator
            .alloc()
            .ok_or(PageTableError::OutOfPhysicalFrames)?;
        let index = self.page_count;

        #[cfg(target_arch = "riscv64")]
        {
            // SAFETY: `index` is below the fixed capacity and becomes
            // initialized before `page_count` is increased.
            unsafe {
                self.pages.add(index).write(OwnedPageTablePage::new(ppn));
            }
        }
        #[cfg(not(target_arch = "riscv64"))]
        {
            self.pages[index].write(OwnedPageTablePage::new(ppn));
        }

        self.page_count += 1;
        Ok(index)
    }

    fn page_index(&self, ppn: PhysPageNum) -> Option<usize> {
        let mut index = 0;
        while index < self.page_count {
            if self.page(index).ppn == ppn {
                return Some(index);
            }
            index += 1;
        }
        None
    }

    fn entry(&self, location: PteLocation) -> PageTableEntry {
        self.page(location.page_index).entries[location.entry_index]
    }

    fn entry_mut(&mut self, location: PteLocation) -> &mut PageTableEntry {
        &mut self.page_mut(location.page_index).entries[location.entry_index]
    }

    fn page(&self, index: usize) -> &OwnedPageTablePage {
        debug_assert!(index < self.page_count);
        #[cfg(target_arch = "riscv64")]
        {
            // SAFETY: Slots below `page_count` have been initialized, and the
            // static storage is exclusively owned by this PageTable value.
            unsafe { &*self.pages.add(index) }
        }
        #[cfg(not(target_arch = "riscv64"))]
        {
            // SAFETY: Page table slots are initialized only through `new` and
            // `alloc_page_table_page`, both of which increment `page_count` after
            // writing the slot. All callers pass indexes below `page_count`.
            unsafe { self.pages[index].assume_init_ref() }
        }
    }

    fn page_mut(&mut self, index: usize) -> &mut OwnedPageTablePage {
        debug_assert!(index < self.page_count);
        #[cfg(target_arch = "riscv64")]
        {
            // SAFETY: Same invariant as `page`; mutable access is through `&mut
            // self`, so no aliasing mutable references to the same slot exist.
            unsafe { &mut *self.pages.add(index) }
        }
        #[cfg(not(target_arch = "riscv64"))]
        {
            // SAFETY: Same invariant as `page`; mutable access is through `&mut
            // self`, so no aliasing mutable references to the same slot exist.
            unsafe { self.pages[index].assume_init_mut() }
        }
    }
}

/// Construct an Sv39 satp value for the given root page table PPN.
pub const fn make_satp(root_ppn: PhysPageNum) -> usize {
    (SATP_MODE_SV39 << 60) | root_ppn.value()
}

/// Minimal kernel address space for Lab4.
pub struct MemorySet {
    page_table: PageTable,
}

impl MemorySet {
    /// Create an empty address space with a freshly allocated root page table.
    pub fn new(allocator: StackFrameAllocator) -> Result<Self, PageTableError> {
        Ok(Self {
            page_table: PageTable::new(allocator)?,
        })
    }

    /// Return the page table for inspection.
    pub fn page_table(&self) -> &PageTable {
        &self.page_table
    }

    /// Return the mutable page table for controlled construction.
    pub fn page_table_mut(&mut self) -> &mut PageTable {
        &mut self.page_table
    }

    /// Map a half-open physical range as identity-mapped virtual pages.
    pub fn map_identity_range(
        &mut self,
        start: PhysAddr,
        end: PhysAddr,
        flags: PTEFlags,
    ) -> Result<(), PageTableError> {
        self.page_table.map_identity_range(start, end, flags)
    }

    /// Map one page.
    pub fn map(
        &mut self,
        vpn: VirtPageNum,
        ppn: PhysPageNum,
        flags: PTEFlags,
    ) -> Result<(), PageTableError> {
        self.page_table.map(vpn, ppn, flags)
    }

    /// Unmap one page.
    pub fn unmap(&mut self, vpn: VirtPageNum) -> Result<(), PageTableError> {
        self.page_table.unmap(vpn)
    }

    /// Translate one virtual address.
    pub fn translate(&self, va: VirtAddr) -> Option<PhysAddr> {
        self.page_table.translate(va)
    }

    /// Allocate one data frame.
    pub fn alloc_data_frame(&mut self) -> Result<PhysPageNum, PageTableError> {
        self.page_table.alloc_data_frame()
    }

    /// Activate this address space and flush stale address translations.
    pub fn activate(&self) -> usize {
        self.page_table.sync_to_physical();
        let satp = self.page_table.satp();
        // SAFETY: The page table has been fully synchronized to physical
        // memory and contains identity mappings for the currently executing
        // code, rodata, data, BSS and boot stack before `satp` is written.
        unsafe {
            write_satp_and_sfence(satp);
        }
        satp
    }
}

/// Check that the Lab4 interfaces work without relying on hardware paging.
pub fn starter_interfaces_are_present() -> bool {
    let va = VirtAddr::new(0x8020_0000);
    let vpn = va.floor();
    let _ceil = va.ceil();
    let _offset = va.page_offset();
    let _indexes = vpn.indexes();
    let _identity = identity_physical_address(va);

    let mut allocator = StackFrameAllocator::new();
    allocator.init(PhysPageNum::new(0x1000), PhysPageNum::new(0x1010));
    let mut memory_set = match MemorySet::new(allocator) {
        Ok(memory_set) => memory_set,
        Err(_) => return false,
    };

    let flags = PTEFlags::R | PTEFlags::W | PTEFlags::A | PTEFlags::D;
    let ppn = PhysPageNum::new(0x2000);
    memory_set.map(vpn, ppn, flags).is_ok()
        && memory_set.translate(va) == Some(PhysAddr::new(0x2000_0000))
        && memory_set.unmap(vpn).is_ok()
        && memory_set.translate(va).is_none()
        && PAGE_SIZE == 4096
}

unsafe fn write_satp_and_sfence(satp: usize) {
    #[cfg(target_arch = "riscv64")]
    {
        asm!(
            "csrw satp, {satp_value}",
            "sfence.vma",
            satp_value = in(reg) satp,
            options(nostack)
        );
    }

    #[cfg(not(target_arch = "riscv64"))]
    {
        let _ = satp;
    }
}

#[cfg(test)]
mod tests {
    use super::{make_satp, MemorySet, PTEFlags, PageTableEntry, PageTableError, SATP_MODE_SV39};
    use crate::memory::{
        virtual_address::{VirtAddr, VirtPageNum},
        FrameAllocator, PhysAddr, PhysPageNum, StackFrameAllocator,
    };

    fn test_allocator() -> StackFrameAllocator {
        let mut allocator = StackFrameAllocator::new();
        allocator.init(PhysPageNum::new(0x1000), PhysPageNum::new(0x1100));
        allocator
    }

    fn test_memory_set() -> MemorySet {
        MemorySet::new(test_allocator()).unwrap()
    }

    #[test]
    fn pte_flags_and_leaf_status_are_read_back() {
        let flags = PTEFlags::R | PTEFlags::W | PTEFlags::A | PTEFlags::D;
        let pte = PageTableEntry::new(PhysPageNum::new(0x2345), flags | PTEFlags::V);

        assert!(pte.ppn() == PhysPageNum::new(0x2345));
        assert!(pte.flags().contains(PTEFlags::V));
        assert!(pte.flags().contains(PTEFlags::R));
        assert!(pte.flags().contains(PTEFlags::W));
        assert!(pte.flags().contains(PTEFlags::A));
        assert!(pte.flags().contains(PTEFlags::D));
        assert!(pte.is_valid());
        assert!(pte.is_leaf());

        let branch = PageTableEntry::new(PhysPageNum::new(0x3000), PTEFlags::V);
        assert!(branch.is_valid());
        assert!(!branch.is_leaf());
        assert!(!PageTableEntry::empty().is_valid());
    }

    #[test]
    fn make_satp_uses_sv39_mode_and_root_ppn() {
        let root = PhysPageNum::new(0x12345);
        assert!(make_satp(root) == ((SATP_MODE_SV39 << 60) | root.value()));
    }

    #[test]
    fn map_then_translate_one_page() {
        let mut memory_set = test_memory_set();
        let va = VirtAddr::new(0x4000_0123);
        let vpn = va.floor();
        let ppn = PhysPageNum::new(0x2000);

        memory_set
            .map(
                vpn,
                ppn,
                PTEFlags::R | PTEFlags::W | PTEFlags::A | PTEFlags::D,
            )
            .unwrap();

        assert!(memory_set.translate(va) == Some(PhysAddr::new(0x2000_123)));
    }

    #[test]
    fn map_creates_owned_intermediate_page_tables() {
        let mut memory_set = test_memory_set();
        let root = memory_set.page_table().root_ppn();

        memory_set
            .map(
                VirtPageNum::new(0x12345),
                PhysPageNum::new(0x2000),
                PTEFlags::R | PTEFlags::A,
            )
            .unwrap();

        assert!(memory_set.page_table().owns_page_table_frame(root));
        assert!(memory_set.page_table().owned_page_count() >= 3);
    }

    #[test]
    fn duplicate_map_is_rejected() {
        let mut memory_set = test_memory_set();
        let vpn = VirtPageNum::new(0x4000);
        let flags = PTEFlags::R | PTEFlags::W | PTEFlags::A | PTEFlags::D;

        assert!(memory_set.map(vpn, PhysPageNum::new(0x2000), flags).is_ok());
        assert!(
            memory_set.map(vpn, PhysPageNum::new(0x2001), flags)
                == Err(PageTableError::AlreadyMapped)
        );
    }

    #[test]
    fn unmap_missing_page_is_rejected() {
        let mut memory_set = test_memory_set();
        assert!(memory_set.unmap(VirtPageNum::new(0x4000)) == Err(PageTableError::NotMapped));
    }

    #[test]
    fn unmap_removes_translation() {
        let mut memory_set = test_memory_set();
        let va = VirtAddr::new(0x4000_0123);
        let vpn = va.floor();
        let flags = PTEFlags::R | PTEFlags::W | PTEFlags::A | PTEFlags::D;

        memory_set
            .map(vpn, PhysPageNum::new(0x2000), flags)
            .unwrap();
        assert!(memory_set.translate(va).is_some());
        assert!(memory_set.unmap(vpn).is_ok());
        assert!(memory_set.translate(va).is_none());
    }

    #[test]
    fn permission_combinations_are_preserved() {
        let mut memory_set = test_memory_set();
        let vpn = VirtPageNum::new(0x5000);
        let flags = PTEFlags::R | PTEFlags::X | PTEFlags::A;

        memory_set
            .map(vpn, PhysPageNum::new(0x2500), flags)
            .unwrap();
        let pte = memory_set.page_table().find_pte(vpn).unwrap();

        assert!(pte.flags().contains(PTEFlags::V));
        assert!(pte.flags().contains(PTEFlags::R));
        assert!(pte.flags().contains(PTEFlags::X));
        assert!(!pte.flags().contains(PTEFlags::W));
    }
}
