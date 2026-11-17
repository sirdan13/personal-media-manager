import os
import tempfile
import hashlib
from PIL import Image
from agent.scanner_agent import ScannerAgent


def test_agent_compute_sha256_matches_standard():
    agent = ScannerAgent("http://testserver", "demo@example.com", "pass")
    
    with tempfile.NamedTemporaryFile(delete=False) as f:
        # Write 512KB of known bytes
        data = b"PersonalMediaManagerTestBlock1234567890" * 15000
        f.write(data)
        temp_path = f.name

    try:
        expected = hashlib.sha256(data).hexdigest()
        computed = agent.compute_sha256(temp_path)
        assert computed == expected
    finally:
        os.unlink(temp_path)


def test_agent_thumbnail_and_metadata_generation():
    agent = ScannerAgent("http://testserver", "demo@example.com", "pass")
    
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
        temp_img_path = f.name

    try:
        # Create a test 1000x800 image
        img = Image.new("RGB", (1000, 800), color=(73, 109, 137))
        img.save(temp_img_path, format="JPEG")

        captured_at, width, height, meta, thumb = agent.extract_image_metadata_and_thumb(temp_img_path)

        assert width == 1000
        assert height == 800
        assert thumb is not None
        assert thumb.startswith("data:image/webp;base64,")
    finally:
        os.unlink(temp_img_path)


def test_agent_scan_workflow_with_testclient(client, auth_headers):
    # Adapter to let agent.session talk to FastAPI TestClient
    agent = ScannerAgent("http://testserver", "test@example.com", "SuperSecretPassword123!")

    class TestClientSessionAdapter:
        def __init__(self, test_client):
            self.tc = test_client
            self.headers = {}

        def post(self, url, json=None, timeout=None):
            path = url.replace("http://testserver", "")
            return self.tc.post(path, json=json, headers=self.headers)

        def get(self, url, timeout=None):
            path = url.replace("http://testserver", "")
            return self.tc.get(path, headers=self.headers)

    agent.session = TestClientSessionAdapter(client)
    agent.token = auth_headers["Authorization"].split()[1]
    agent.session.headers = auth_headers

    # Create a temporary folder with 2 images
    with tempfile.TemporaryDirectory() as scan_dir:
        sub = os.path.join(scan_dir, "Summer2026")
        os.makedirs(sub, exist_ok=True)

        img1_p = os.path.join(sub, "sea.jpg")
        img2_p = os.path.join(scan_dir, "mountain.png")

        Image.new("RGB", (200, 200), color="blue").save(img1_p, format="JPEG")
        Image.new("RGB", (300, 300), color="green").save(img2_p, format="PNG")

        # Run scanner agent
        agent.run(
            folder_path=scan_dir,
            source_name="Agent Test Drive",
            batch_size=10,
            incremental=True,
            reconcile=True
        )

        # Verify items were ingested into the backend
        media_list = client.get("/api/v1/media", headers=auth_headers).json()
        assert len(media_list) >= 2

        # Check that sources list has the new source
        sources = client.get("/api/v1/sources", headers=auth_headers).json()
        agent_sources = [s for s in sources if s["name"] == "Agent Test Drive"]
        assert len(agent_sources) == 1
        assert agent_sources[0]["source_type"] == "local_folder"
