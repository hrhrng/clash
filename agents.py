"""
Unified export interface for all video production agents.
Import agents from their individual modules for cleaner organization.
"""

# Import from individual agent modules
from script_agent import generate_script
from asset_agent import generate_assets
from shot_agent import generate_shots, print_production_summary

# Import prompts for convenience
from prompts import SCRIPT_GENERATION_SYSTEM_PROMPT

# Export all public functions
__all__ = [
    'generate_script',
    'generate_assets',
    'generate_shots',
    'print_production_summary',
    'SCRIPT_GENERATION_SYSTEM_PROMPT',
]
