/// Size of one physical page in bytes.
pub const PAGE_SIZE: usize = 4096;

/// A physical address used by the Lab3 frame allocator.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct PhysAddr(pub usize);

impl PhysAddr {
    /// Create a physical address from a raw integer.
    pub const fn new(value: usize) -> Self {
        Self(value)
    }

    /// Return the raw integer value of this address.
    pub const fn value(self) -> usize {
        self.0
    }

    /// Return the page number containing this address.
    pub fn floor(self) -> PhysPageNum {
        PhysPageNum::new(self.0 / PAGE_SIZE)
    }

    /// Return the first page number whose page starts at or after this address.
    pub fn ceil(self) -> PhysPageNum {
        PhysPageNum::new(self.0.div_ceil(PAGE_SIZE))
    }

    /// Return this address's offset inside its 4 KiB page.
    pub fn page_offset(self) -> usize {
        self.0 % PAGE_SIZE
    }
}

/// A physical page number used by the Lab3 frame allocator.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct PhysPageNum(pub usize);

impl PhysPageNum {
    /// Create a physical page number from a raw integer.
    pub const fn new(value: usize) -> Self {
        Self(value)
    }

    /// Return the raw integer value of this page number.
    pub const fn value(self) -> usize {
        self.0
    }

    /// Return the start address of this physical page.
    pub fn start_address(self) -> PhysAddr {
        PhysAddr::new(self.0 * PAGE_SIZE)
    }
}

impl From<PhysPageNum> for PhysAddr {
    fn from(value: PhysPageNum) -> Self {
        value.start_address()
    }
}

#[cfg(test)]
mod tests {
    use super::{PhysAddr, PhysPageNum, PAGE_SIZE};

    #[test]
    fn floor_handles_aligned_and_unaligned_addresses() {
        assert!(PhysAddr::new(0x8020_0000).floor() == PhysPageNum::new(0x80200));
        assert!(PhysAddr::new(0x8020_0001).floor() == PhysPageNum::new(0x80200));
        assert!(PhysAddr::new(0x8020_0fff).floor() == PhysPageNum::new(0x80200));
    }

    #[test]
    fn ceil_handles_aligned_and_unaligned_addresses() {
        assert!(PhysAddr::new(0x8020_0000).ceil() == PhysPageNum::new(0x80200));
        assert!(PhysAddr::new(0x8020_0001).ceil() == PhysPageNum::new(0x80201));
        assert!(PhysAddr::new(0x8020_0fff).ceil() == PhysPageNum::new(0x80201));
    }

    #[test]
    fn page_offset_keeps_only_bytes_inside_one_page() {
        assert!(PhysAddr::new(0x8020_0000).page_offset() == 0);
        assert!(PhysAddr::new(0x8020_0123).page_offset() == 0x123);
        assert!(PhysAddr::new(0x8020_0fff).page_offset() == PAGE_SIZE - 1);
    }

    #[test]
    fn page_number_converts_back_to_page_start_address() {
        let ppn = PhysPageNum::new(0x80201);
        assert!(ppn.start_address() == PhysAddr::new(0x8020_1000));
        assert!(PhysAddr::from(ppn) == PhysAddr::new(0x8020_1000));
    }
}
