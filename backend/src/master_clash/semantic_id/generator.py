"""Semantic ID generator with collision detection.

Generates human-readable IDs composed of three words from curated wordlists.
Ensures uniqueness within a project scope through database collision detection.
"""

import random
from typing import Callable, Optional

from .wordlists import ALL_WORDLISTS


class SemanticIDGenerator:
    """Generator for semantic IDs with collision detection.

    Creates IDs in the format: "word1-word2-word3"
    Each word comes from a different wordlist to maximize variety.

    Example IDs:
        - "alpha-ocean-square"
        - "beta-mountain-circle"
        - "gamma-river-triangle"
    """

    def __init__(
        self,
        wordlists: Optional[list[list[str]]] = None,
        separator: str = "-",
        max_attempts: int = 100,
    ):
        """Initialize the generator.

        Args:
            wordlists: List of wordlists to use. Defaults to ALL_WORDLISTS.
            separator: Separator between words. Defaults to "-".
            max_attempts: Maximum collision resolution attempts. Defaults to 100.
        """
        self.wordlists = wordlists or ALL_WORDLISTS
        self.separator = separator
        self.max_attempts = max_attempts

        # Validate wordlists
        if len(self.wordlists) != 3:
            raise ValueError(f"Expected 3 wordlists, got {len(self.wordlists)}")

        for i, wordlist in enumerate(self.wordlists):
            if not wordlist:
                raise ValueError(f"Wordlist {i} is empty")

    def generate(self) -> str:
        """Generate a single semantic ID.

        Returns:
            A semantic ID string (e.g., "alpha-ocean-square")
        """
        words = [random.choice(wordlist) for wordlist in self.wordlists]
        return self.separator.join(words)

    def generate_unique(
        self,
        is_unique: Callable[[str], bool],
        context: Optional[str] = None,
    ) -> str:
        """Generate a unique semantic ID within a given context.

        Args:
            is_unique: Function that returns True if ID is unique.
                      Should check against existing IDs in the context.
            context: Optional context string for logging/debugging.

        Returns:
            A unique semantic ID string.

        Raises:
            RuntimeError: If unable to generate unique ID within max_attempts.

        Example:
            >>> def check_unique(id: str) -> bool:
            ...     return id not in existing_ids
            >>> generator = SemanticIDGenerator()
            >>> new_id = generator.generate_unique(check_unique, context="project-123")
        """
        for attempt in range(self.max_attempts):
            candidate = self.generate()

            if is_unique(candidate):
                return candidate

            # On last attempt, raise error
            if attempt == self.max_attempts - 1:
                context_msg = f" in context '{context}'" if context else ""
                raise RuntimeError(
                    f"Failed to generate unique ID after {self.max_attempts} attempts{context_msg}. "
                    f"Consider expanding wordlists or checking collision detection logic."
                )

        # This should never be reached, but added for completeness
        raise RuntimeError("Unexpected error in generate_unique")

    def generate_batch(self, count: int) -> list[str]:
        """Generate a batch of semantic IDs (may contain duplicates).

        Args:
            count: Number of IDs to generate.

        Returns:
            List of semantic ID strings.
        """
        return [self.generate() for _ in range(count)]

    def generate_unique_batch(
        self,
        count: int,
        is_unique: Callable[[str], bool],
        context: Optional[str] = None,
    ) -> list[str]:
        """Generate a batch of unique semantic IDs.

        Args:
            count: Number of unique IDs to generate.
            is_unique: Function that returns True if ID is unique.
            context: Optional context string for logging/debugging.

        Returns:
            List of unique semantic ID strings.

        Raises:
            RuntimeError: If unable to generate enough unique IDs.
        """
        generated = []
        seen = set()

        for i in range(count):
            # Create a composite uniqueness check
            def composite_check(candidate: str) -> bool:
                return candidate not in seen and is_unique(candidate)

            new_id = self.generate_unique(
                composite_check,
                context=f"{context} (batch {i+1}/{count})" if context else None,
            )

            generated.append(new_id)
            seen.add(new_id)

        return generated


# Convenience function for quick ID generation
def generate_semantic_id(
    wordlists: Optional[list[list[str]]] = None,
    separator: str = "-",
) -> str:
    """Generate a single semantic ID using default settings.

    Args:
        wordlists: Optional custom wordlists. Defaults to ALL_WORDLISTS.
        separator: Separator between words. Defaults to "-".

    Returns:
        A semantic ID string.

    Example:
        >>> id1 = generate_semantic_id()
        'alpha-ocean-square'
        >>> id2 = generate_semantic_id(separator='_')
        'beta_mountain_circle'
    """
    generator = SemanticIDGenerator(wordlists=wordlists, separator=separator)
    return generator.generate()


# Example usage and utilities
def estimate_collision_probability(wordlists: list[list[str]], existing_count: int) -> float:
    """Estimate probability of collision with existing IDs.

    Uses the birthday problem approximation:
    P(collision) ≈ 1 - e^(-n²/2N)

    where:
        n = number of existing IDs
        N = total possible unique IDs

    Args:
        wordlists: The wordlists being used.
        existing_count: Number of existing IDs.

    Returns:
        Estimated collision probability as a float between 0 and 1.
    """
    import math

    # Calculate total possible IDs
    total_possible = 1
    for wordlist in wordlists:
        total_possible *= len(wordlist)

    # Birthday problem approximation
    n_squared = existing_count ** 2
    exponent = -n_squared / (2 * total_possible)
    probability = 1 - math.exp(exponent)

    return probability


def get_id_space_size(wordlists: Optional[list[list[str]]] = None) -> int:
    """Calculate the total number of possible unique IDs.

    Args:
        wordlists: Optional custom wordlists. Defaults to ALL_WORDLISTS.

    Returns:
        Total number of possible unique IDs.

    Example:
        >>> get_id_space_size()
        64000000  # 400 × 400 × 400
    """
    wordlists = wordlists or ALL_WORDLISTS
    total = 1
    for wordlist in wordlists:
        total *= len(wordlist)
    return total


if __name__ == "__main__":
    # Demo and testing
    print("Semantic ID Generator Demo")
    print("=" * 60)

    # Create generator
    generator = SemanticIDGenerator()

    # Generate some sample IDs
    print("\nSample IDs:")
    for i in range(10):
        print(f"  {i+1}. {generator.generate()}")

    # Show ID space size
    space_size = get_id_space_size()
    print(f"\nTotal possible unique IDs: {space_size:,}")
    print(f"(That's {space_size / 1_000_000:.1f} million combinations!)")

    # Show collision probabilities
    print("\nCollision probability estimates:")
    for count in [100, 1_000, 10_000, 100_000]:
        prob = estimate_collision_probability(ALL_WORDLISTS, count)
        print(f"  With {count:,} existing IDs: {prob*100:.4f}%")

    # Test uniqueness check
    print("\nTesting uniqueness check:")
    existing = set()

    def check_unique(id: str) -> bool:
        return id not in existing

    # Generate 5 unique IDs
    for i in range(5):
        new_id = generator.generate_unique(check_unique)
        existing.add(new_id)
        print(f"  {i+1}. {new_id}")

    print(f"\nGenerated {len(existing)} unique IDs")
