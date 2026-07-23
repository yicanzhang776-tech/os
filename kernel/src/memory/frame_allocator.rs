use super::PhysPageNum;

const MAX_RECYCLED_FRAMES: usize = 256;

/// Errors reported by the Lab3 physical frame allocator.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum FrameAllocatorError {
    /// The allocator has not been initialized with a valid frame range.
    NotInitialized,
    /// The released frame does not belong to the allocator's managed range.
    OutOfRange,
    /// The released frame belongs to the range but has not been allocated.
    NotAllocated,
    /// The same frame was released more than once.
    DoubleFree,
    /// The fixed-size recycle stack is full.
    RecycleListFull,
}

/// Minimal interface students implement in Lab3.
pub trait FrameAllocator {
    /// Initialize the allocator with a half-open page range [start, end).
    fn init(&mut self, start: PhysPageNum, end: PhysPageNum);

    /// Allocate one free physical page.
    fn alloc(&mut self) -> Option<PhysPageNum>;

    /// Return one previously allocated physical page.
    fn dealloc(&mut self, ppn: PhysPageNum) -> Result<(), FrameAllocatorError>;
}

/// Teaching-oriented stack frame allocator skeleton for Lab3.
pub struct StackFrameAllocator {
    start: PhysPageNum,
    end: PhysPageNum,
    next: PhysPageNum,
    recycled: [PhysPageNum; MAX_RECYCLED_FRAMES],
    recycled_len: usize,
    initialized: bool,
}

impl StackFrameAllocator {
    /// Create an empty allocator skeleton.
    pub const fn new() -> Self {
        Self {
            start: PhysPageNum::new(0),
            end: PhysPageNum::new(0),
            next: PhysPageNum::new(0),
            recycled: [PhysPageNum::new(0); MAX_RECYCLED_FRAMES],
            recycled_len: 0,
            initialized: false,
        }
    }

    /// Return the managed half-open page range.
    pub const fn bounds(&self) -> (PhysPageNum, PhysPageNum) {
        (self.start, self.end)
    }

    /// Return whether init has been called.
    pub const fn is_initialized(&self) -> bool {
        self.initialized
    }

    fn contains_recycled(&self, ppn: PhysPageNum) -> bool {
        let mut index = 0;
        while index < self.recycled_len {
            if self.recycled[index] == ppn {
                return true;
            }
            index += 1;
        }
        false
    }
}

impl Default for StackFrameAllocator {
    fn default() -> Self {
        Self::new()
    }
}

impl FrameAllocator for StackFrameAllocator {
    fn init(&mut self, start: PhysPageNum, end: PhysPageNum) {
        self.start = start;
        self.end = end;
        self.next = start;
        self.recycled_len = 0;
        self.initialized = true;
    }

    fn alloc(&mut self) -> Option<PhysPageNum> {
        if !self.initialized {
            return None;
        }

        if self.recycled_len > 0 {
            self.recycled_len -= 1;
            return Some(self.recycled[self.recycled_len]);
        }

        if self.next < self.end {
            let ppn = self.next;
            self.next = PhysPageNum::new(self.next.value() + 1);
            return Some(ppn);
        }

        None
    }

    fn dealloc(&mut self, ppn: PhysPageNum) -> Result<(), FrameAllocatorError> {
        if !self.initialized {
            return Err(FrameAllocatorError::NotInitialized);
        }
        if ppn < self.start || ppn >= self.end {
            return Err(FrameAllocatorError::OutOfRange);
        }
        if ppn >= self.next {
            return Err(FrameAllocatorError::NotAllocated);
        }
        if self.contains_recycled(ppn) {
            return Err(FrameAllocatorError::DoubleFree);
        }
        if self.recycled_len == MAX_RECYCLED_FRAMES {
            return Err(FrameAllocatorError::RecycleListFull);
        }

        self.recycled[self.recycled_len] = ppn;
        self.recycled_len += 1;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::{FrameAllocator, FrameAllocatorError, PhysPageNum, StackFrameAllocator};

    #[test]
    fn allocates_one_page_from_single_page_range() {
        let mut allocator = StackFrameAllocator::new();
        allocator.init(PhysPageNum::new(8), PhysPageNum::new(9));

        assert!(allocator.alloc() == Some(PhysPageNum::new(8)));
        assert!(allocator.alloc().is_none());
    }

    #[test]
    fn allocates_multiple_unique_pages_in_order() {
        let mut allocator = StackFrameAllocator::new();
        allocator.init(PhysPageNum::new(8), PhysPageNum::new(11));

        let first = allocator.alloc();
        let second = allocator.alloc();
        let third = allocator.alloc();

        assert!(first == Some(PhysPageNum::new(8)));
        assert!(second == Some(PhysPageNum::new(9)));
        assert!(third == Some(PhysPageNum::new(10)));
        assert!(first != second && second != third && first != third);
        assert!(allocator.alloc().is_none());
    }

    #[test]
    fn allocation_addresses_are_page_aligned() {
        let mut allocator = StackFrameAllocator::new();
        allocator.init(PhysPageNum::new(8), PhysPageNum::new(10));

        let first = allocator.alloc().unwrap();
        let second = allocator.alloc().unwrap();

        assert!(first.start_address().page_offset() == 0);
        assert!(second.start_address().page_offset() == 0);
    }

    #[test]
    fn deallocated_page_is_reused_before_new_pages() {
        let mut allocator = StackFrameAllocator::new();
        allocator.init(PhysPageNum::new(8), PhysPageNum::new(11));

        let first = allocator.alloc().unwrap();
        let second = allocator.alloc().unwrap();

        assert!(allocator.dealloc(second).is_ok());
        assert!(allocator.alloc() == Some(second));
        assert!(allocator.alloc() == Some(PhysPageNum::new(10)));
        assert!(allocator.dealloc(first).is_ok());
        assert!(allocator.alloc() == Some(first));
    }

    #[test]
    fn rejects_out_of_range_deallocation() {
        let mut allocator = StackFrameAllocator::new();
        allocator.init(PhysPageNum::new(8), PhysPageNum::new(10));

        assert!(allocator.dealloc(PhysPageNum::new(7)) == Err(FrameAllocatorError::OutOfRange));
        assert!(allocator.dealloc(PhysPageNum::new(10)) == Err(FrameAllocatorError::OutOfRange));
    }

    #[test]
    fn rejects_double_free() {
        let mut allocator = StackFrameAllocator::new();
        allocator.init(PhysPageNum::new(8), PhysPageNum::new(10));

        let first = allocator.alloc().unwrap();
        assert!(allocator.dealloc(first).is_ok());
        assert!(allocator.dealloc(first) == Err(FrameAllocatorError::DoubleFree));
    }

    #[test]
    fn rejects_release_before_allocation() {
        let mut allocator = StackFrameAllocator::new();
        allocator.init(PhysPageNum::new(8), PhysPageNum::new(10));

        assert!(allocator.dealloc(PhysPageNum::new(8)) == Err(FrameAllocatorError::NotAllocated));
    }
}
