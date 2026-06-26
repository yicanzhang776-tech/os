#![allow(dead_code)]

use super::{
    virtual_address::{identity_physical_address, VirtAddr, VirtPageNum},
    PhysAddr, PhysPageNum, PAGE_SIZE,
};

/// Number of entries in one Sv39 page table page.
pub const PAGE_TABLE_ENTRIES: usize = 512;
/// Sv39 mode value used in the satp register.
pub const SATP_MODE_SV39: usize = 8;

/// Minimal bitflag wrapper for Sv39 page table entry flags.
#[derive(Clone, Copy, PartialEq, Eq)]
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

/// A raw Sv39 page table entry.
#[derive(Clone, Copy, PartialEq, Eq)]
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
        PTEFlags::new(self.bits & 0x3ff)
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
    pub fn ppn(self) -> PhysPageNum {
        // TODO(student): decode PTE bits 10..53 as the physical page number.
        let _ = self;
        PhysPageNum::new(0)
    }
}

/// Errors returned by the Lab4 page table skeleton.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum PageTableError {
    /// The requested mapping already exists.
    AlreadyMapped,
    /// The requested mapping does not exist.
    NotMapped,
    /// The starter intentionally leaves the operation for students.
    Unimplemented,
}

/// Minimal Sv39 page table skeleton.
pub struct PageTable {
    root_ppn: PhysPageNum,
    entries: [PageTableEntry; PAGE_TABLE_ENTRIES],
}

impl PageTable {
    /// Create a page table skeleton for a known root physical page.
    pub const fn new(root_ppn: PhysPageNum) -> Self {
        Self {
            root_ppn,
            entries: [PageTableEntry::empty(); PAGE_TABLE_ENTRIES],
        }
    }

    /// Return the root page table physical page number.
    pub const fn root_ppn(&self) -> PhysPageNum {
        self.root_ppn
    }

    /// Return the starter's fixed root table entries.
    pub const fn entries(&self) -> &[PageTableEntry; PAGE_TABLE_ENTRIES] {
        &self.entries
    }

    /// Find a page table entry, creating intermediate tables when needed.
    pub fn find_pte_create(&mut self, vpn: VirtPageNum) -> Option<&mut PageTableEntry> {
        // TODO(student): walk Sv39 levels and allocate missing intermediate tables.
        let _ = vpn;
        None
    }

    /// Map one virtual page to one physical page with flags.
    pub fn map(
        &mut self,
        vpn: VirtPageNum,
        ppn: PhysPageNum,
        flags: PTEFlags,
    ) -> Result<(), PageTableError> {
        // TODO(student): install a valid leaf PTE and reject duplicate mappings.
        let _ = (vpn, ppn, flags);
        Err(PageTableError::Unimplemented)
    }

    /// Remove one virtual page mapping.
    pub fn unmap(&mut self, vpn: VirtPageNum) -> Result<(), PageTableError> {
        // TODO(student): invalidate the mapped PTE and reject unmapped VPNs.
        let _ = vpn;
        Err(PageTableError::Unimplemented)
    }

    /// Translate a virtual address to a physical address.
    pub fn translate(&self, va: VirtAddr) -> Option<PhysAddr> {
        // TODO(student): walk the page table and combine PPN with page offset.
        let _ = va;
        None
    }

    /// Build the satp value that would activate this root page table.
    pub fn satp(&self) -> usize {
        make_satp(self.root_ppn)
    }
}

/// Construct an Sv39 satp value for the given root page table PPN.
pub const fn make_satp(root_ppn: PhysPageNum) -> usize {
    (SATP_MODE_SV39 << 60) | root_ppn.value()
}

/// Minimal address-space skeleton for Lab4.
pub struct MemorySet {
    page_table: PageTable,
}

impl MemorySet {
    /// Create an empty address-space skeleton.
    pub const fn new(root_ppn: PhysPageNum) -> Self {
        Self {
            page_table: PageTable::new(root_ppn),
        }
    }

    /// Return the page table for inspection.
    pub const fn page_table(&self) -> &PageTable {
        &self.page_table
    }

    /// Activate this address space.
    pub fn activate(&self) -> bool {
        // TODO(student): write satp, execute sfence.vma, and preserve execution.
        false
    }
}

/// Check that starter wiring is present without claiming Lab4 completion.
pub fn starter_interfaces_are_present() -> bool {
    let va = VirtAddr::new(0x8020_0000);
    let vpn = va.floor();
    let _ceil = va.ceil();
    let _offset = va.page_offset();
    let _indexes = vpn.indexes();
    let _identity = identity_physical_address(va);

    let flags = PTEFlags::V
        .union(PTEFlags::R)
        .union(PTEFlags::W)
        .union(PTEFlags::A)
        .union(PTEFlags::D);
    let pte = PageTableEntry::new(PhysPageNum::new(0x80200), flags);
    let _ppn = pte.ppn();
    let _is_valid = pte.is_valid();
    let _is_leaf = pte.is_leaf();
    let _bits = pte.bits();

    let mut page_table = PageTable::new(PhysPageNum::new(0));
    let _root = page_table.root_ppn();
    let _entries = page_table.entries();
    let _find = page_table.find_pte_create(vpn);
    let _map = page_table.map(vpn, PhysPageNum::new(0x80200), flags);
    let _translate = page_table.translate(va);
    let _unmap = page_table.unmap(vpn);
    let _satp = page_table.satp();

    let memory_set = MemorySet::new(PhysPageNum::new(0));
    let _memory_satp = memory_set.page_table().satp();

    PAGE_SIZE == 4096 && !memory_set.activate()
}
