#!/bin/bash
# Run smoke tests across all platforms using Docker
# Usage: ./run-smoke-tests.sh [target]
# Targets: native, unit, ubuntu, debian, fedora, powershell, all (default)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

# Track results (bash 3.x compatible - no associative arrays)
PASSED=""
FAILED=""
SKIPPED=""

run_native() {
    echo -e "\n${YELLOW}=== Running native (macOS/Linux) smoke test ===${NC}"
    if "$SCRIPT_DIR/smoke-test.sh"; then
        PASSED="$PASSED native"
    else
        FAILED="$FAILED native"
    fi
}

run_unit_tests() {
    echo -e "\n${YELLOW}=== Running unit tests ===${NC}"

    # Test: Failure handling
    echo -e "\n${YELLOW}--- Failure Handling Test ---${NC}"
    if "$SCRIPT_DIR/test-failure-handling.sh"; then
        PASSED="$PASSED failure-handling"
    else
        FAILED="$FAILED failure-handling"
    fi

    # Test: Preprocessing (bash only, requires jq)
    echo -e "\n${YELLOW}--- Preprocessing Test ---${NC}"
    if "$SCRIPT_DIR/test-preprocessing.sh"; then
        PASSED="$PASSED preprocessing"
    else
        FAILED="$FAILED preprocessing"
    fi
}

run_docker() {
    local platform="$1"
    local dockerfile="$SCRIPT_DIR/dockerfiles/Dockerfile.$platform"

    if [ ! -f "$dockerfile" ]; then
        echo -e "${RED}Dockerfile not found: $dockerfile${NC}"
        SKIPPED="$SKIPPED $platform"
        return
    fi

    echo -e "\n${YELLOW}=== Running $platform smoke test (Docker) ===${NC}"

    local image_name="skill-manager-test-$platform"

    # Build image
    if ! docker build -t "$image_name" -f "$dockerfile" "$REPO_DIR" 2>&1; then
        echo -e "${RED}Failed to build Docker image for $platform${NC}"
        FAILED="$FAILED $platform"
        return
    fi

    # Run test
    if docker run --rm "$image_name" 2>&1; then
        PASSED="$PASSED $platform"
    else
        FAILED="$FAILED $platform"
    fi
}

print_summary() {
    echo -e "\n${YELLOW}=== Test Summary ===${NC}"

    for p in $PASSED; do
        echo -e "  $p: ${GREEN}PASS${NC}"
    done
    for p in $FAILED; do
        echo -e "  $p: ${RED}FAIL${NC}"
    done
    for p in $SKIPPED; do
        echo -e "  $p: ${YELLOW}SKIP${NC}"
    done

    echo ""
    if [ -z "$FAILED" ]; then
        echo -e "${GREEN}All tests passed!${NC}"
        return 0
    else
        echo -e "${RED}Some tests failed.${NC}"
        return 1
    fi
}

# Check Docker is available
check_docker() {
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}Docker is not installed or not in PATH${NC}"
        echo "Docker is required for cross-platform testing."
        echo "Install from: https://docs.docker.com/get-docker/"
        exit 1
    fi

    if ! docker info &> /dev/null; then
        echo -e "${RED}Docker daemon is not running${NC}"
        echo "Please start Docker and try again."
        exit 1
    fi
}

# Main
PLATFORM="${1:-all}"

case "$PLATFORM" in
    native)
        run_native
        ;;
    unit)
        run_unit_tests
        ;;
    ubuntu|debian|fedora|powershell)
        check_docker
        run_docker "$PLATFORM"
        ;;
    all)
        # Run native smoke test first (fastest feedback)
        run_native

        # Run unit tests
        run_unit_tests

        # Then run Docker tests
        check_docker
        for platform in ubuntu debian fedora powershell; do
            run_docker "$platform"
        done
        ;;
    *)
        echo "Usage: $0 [target]"
        echo "Targets: native, unit, ubuntu, debian, fedora, powershell, all (default)"
        exit 1
        ;;
esac

print_summary
