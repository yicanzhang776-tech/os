#![allow(dead_code)]

use super::PhysAddr;

/// Number of VPN levels in RISC-V Sv39.
pub const SV39_LEVELS: usize = 3;
/// Number of bits used by one Sv39 VPN index.
pub const VPN_INDEX_BITS: usize = 9;
/// Mask for one Sv39 VPN index.
pub const VPN_INDEX_MASK: usize = (1 << VPN_INDEX_BITS) - 1;

/// A virtual address used by the Lab4 Sv39 exercise.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct VirtAddr(pub usize);

impl VirtAddr {
    /// Create a virtual address from a raw integer.
    pub const fn new(value: usize) -> Self {
        Self(value)
    }

    /// Return the raw integer value of this virtual address.
    pub const fn value(self) -> usize {
        self.0
    }

    /// Return the virtual page number containing this address.
    pub fn floor(self) -> VirtPageNum {
        // TODO(LAB4-T1): divide the virtual address by PAGE_SIZE.
        let _ = self;
        VirtPageNum::new(0)
    }

    /// Return the first virtual page number whose page starts at or after this address.
    pub fn ceil(self) -> VirtPageNum {
        // TODO(LAB4-T1): handle aligned and unaligned virtual addresses.
        let _ = self;
        VirtPageNum::new(0)
    }

    /// Return this address's offset inside its 4 KiB page.
    pub fn page_offset(self) -> usize {
        // TODO(LAB4-T1): keep only the low 12 bits within one page.
        let _ = self;
        0
    }
}

/// A virtual page number used by the Lab4 Sv39 exercise.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct VirtPageNum(pub usize);

impl VirtPageNum {
    /// Create a virtual page number from a raw integer.
    pub const fn new(value: usize) -> Self {
        Self(value)
    }

    /// Return the raw integer value of this virtual page number.
    pub const fn value(self) -> usize {
        self.0
    }

    /// Return Sv39 indexes in [level-0, level-1, level-2] order.
    pub fn indexes(self) -> [usize; SV39_LEVELS] {
        // TODO(LAB4-T1): split the VPN into three 9-bit indexes.
        let _ = self;
        [0; SV39_LEVELS]
    }
}

/// Translate an identity-mapped virtual address into a physical address.
///
/// Lab4 starter uses this only as documentation for the future kernel mapping
/// strategy; it does not enable paging.
pub fn identity_physical_address(va: VirtAddr) -> PhysAddr {
    PhysAddr::new(va.value())
}
