"""
Optional command-line tool for the video production system.
Main workflow should be in Jupyter Notebook (video.ipynb).
"""

import json
import argparse
from agents import generate_script, generate_assets, generate_shots, print_production_summary
from config import print_config


def main():
    """Simple CLI wrapper - main workflow should be in notebook."""
    parser = argparse.ArgumentParser(
        description="AI Video Production System - Generate script from story idea"
    )
    parser.add_argument(
        "input",
        type=str,
        help="Story idea (text) or path to CSV file containing the script"
    )
    parser.add_argument(
        "--output-json",
        type=str,
        default=None,
        help="Save script JSON to this file path"
    )
    parser.add_argument(
        "--full",
        action="store_true",
        help="Run full production (script + assets + shots)"
    )

    args = parser.parse_args()

    # Print configuration
    print_config()
    print("\n" + "="*60)
    print("AI VIDEO PRODUCTION SYSTEM")
    print("="*60)
    print("\nTIP: For full control, use video.ipynb notebook instead\n")

    # Step 1: Generate Script
    script = generate_script(args.input)

    # Optionally save script JSON
    if args.output_json:
        script_dict = script.model_dump()
        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump(script_dict, f, indent=2, ensure_ascii=False)
        print(f"\n💾 Script saved to: {args.output_json}")

    # Optionally run full production
    if args.full:
        asset_images = generate_assets(script)
        shot_images = generate_shots(script, asset_images)
        print_production_summary(script, asset_images, shot_images)

    print("\n✅ Complete!")


if __name__ == "__main__":
    main()
