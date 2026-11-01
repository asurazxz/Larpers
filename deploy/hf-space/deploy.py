"""Upload the solver API to a Hugging Face Docker Space. Run from the repo root by .github/workflows/deploy-solver.yml.

Copies only what the API needs (api, solver, contracts, data inputs) plus this folder's Dockerfile and README into a
temporary folder, sets the Space's public variables, and uploads it. The Space builds the image and runs uvicorn.

    HF_TOKEN=hf_... python deploy/hf-space/deploy.py [--dry-run]
"""

import argparse
import os
import shutil
import subprocess
import tarfile
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
PATHS = ["api", "solver", "contracts", "requirements.txt", "data/prepare.py", "data/raw", "data/reference",
         "prototype/osrm_table_84.json"]
VARIABLES = {
    "FRONTEND_URL": os.environ.get("FRONTEND_URL", "https://larpers-three.vercel.app"),
}


def build(out):
    archive = out / "src.tar"
    subprocess.run(["git", "archive", "-o", str(archive), "HEAD", *PATHS], cwd=ROOT, check=True)
    with tarfile.open(archive) as tar:
        tar.extractall(out, filter="data")
    archive.unlink()
    for name in ("Dockerfile", "README.md"):
        shutil.copyfile(HERE / name, out / name)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="build the folder and list it, upload nothing")
    args = parser.parse_args()

    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp)
        build(out)
        files = sorted(p.relative_to(out).as_posix() for p in out.rglob("*") if p.is_file())
        print(f"{len(files)} files")
        if args.dry_run:
            print("\n".join(files))
            return

        from huggingface_hub import HfApi

        api = HfApi(token=os.environ["HF_TOKEN"])
        repo = os.environ.get("HF_SPACE") or f"{api.whoami()['name']}/larpers-solver"
        api.create_repo(repo, repo_type="space", space_sdk="docker", exist_ok=True)
        for key, value in VARIABLES.items():
            api.add_space_variable(repo, key, value)
        if os.environ.get("GEMINI_API_KEY"):
            api.add_space_secret(repo, "GEMINI_API_KEY", os.environ["GEMINI_API_KEY"])
        api.upload_folder(repo_id=repo, repo_type="space", folder_path=str(out),
                          commit_message=f"Deploy {os.environ.get('GITHUB_SHA', 'local')[:7]}")
        host = repo.replace("/", "-").replace("_", "-").replace(".", "-").lower()
        print(f"Space page: https://huggingface.co/spaces/{repo}")
        print(f"Solver URL: https://{host}.hf.space")


if __name__ == "__main__":
    main()
