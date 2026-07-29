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
        VirtPageNum::new(self.0 / super::PAGE_SIZE)
    }

    /// Return the first virtual page number whose page starts at or after this address.
    pub fn ceil(self) -> VirtPageNum {
        VirtPageNum::new(self.0.div_ceil(super::PAGE_SIZE))
    }

    /// Return this address's offset inside its 4 KiB page.
    pub fn page_offset(self) -> usize {
        self.0 % super::PAGE_SIZE
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
        [
            self.0 & VPN_INDEX_MASK,
            (self.0 >> VPN_INDEX_BITS) & VPN_INDEX_MASK,
            (self.0 >> (VPN_INDEX_BITS * 2)) & VPN_INDEX_MASK,
        ]
    }

    /// Return the start address of this virtual page.
    pub fn start_address(self) -> VirtAddr {
        VirtAddr::new(self.0 * super::PAGE_SIZE)
    }
}

impl From<VirtPageNum> for VirtAddr {
    fn from(value: VirtPageNum) -> Self {
        value.start_address()
    }
}

/// Translate an identity-mapped virtual address into a physical address.
///
/// Lab4 starter uses this only as documentation for the future kernel mapping
/// strategy; it does not enable paging.
pub fn identity_physical_address(va: VirtAddr) -> PhysAddr {
    PhysAddr::new(va.value())
}

#[cfg(test)]
mod tests {
    use super::{VirtAddr, VirtPageNum};
    use crate::memory::PAGE_SIZE;

    #[test]
    fn virtual_address_floor_handles_aligned_and_unaligned_addresses() {
        assert!(VirtAddr::new(0x8020_0000).floor() == VirtPageNum::new(0x80200));
        assert!(VirtAddr::new(0x8020_0001).floor() == VirtPageNum::new(0x80200));
        assert!(VirtAddr::new(0x8020_0fff).floor() == VirtPageNum::new(0x80200));
    }

    #[test]
    fn virtual_address_ceil_handles_aligned_and_unaligned_addresses() {
        assert!(VirtAddr::new(0x8020_0000).ceil() == VirtPageNum::new(0x80200));
        assert!(VirtAddr::new(0x8020_0001).ceil() == VirtPageNum::new(0x80201));
        assert!(VirtAddr::new(0x8020_0fff).ceil() == VirtPageNum::new(0x80201));
    }

    #[test]
    fn virtual_address_page_offset_keeps_low_page_bits() {
        assert!(VirtAddr::new(0x8020_0000).page_offset() == 0);
        assert!(VirtAddr::new(0x8020_0123).page_offset() == 0x123);
        assert!(VirtAddr::new(0x8020_0fff).page_offset() == PAGE_SIZE - 1);
    }

    #[test]
    fn sv39_indexes_are_split_from_low_to_high_level() {
        let vpn = VirtPageNum::new((3 << 18) | (2 << 9) | 1);
        assert!(vpn.indexes() == [1, 2, 3]);
    }
}
