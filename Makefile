PYTHON ?= python3

.PHONY: help pipeline pipeline-offline verify test clean

help:
	@printf '%s\n' \
		'make pipeline          Fetch, validate and package the content bundle (network)' \
		'make pipeline-offline  Rebuild from the local HTTP cache only' \
		'make verify            Verify the last built bundle against its manifest' \
		'make test              Run the offline test suite (no network)' \
		'make clean             Remove cached HTTP responses and the SQLite bundle'

pipeline:
	cd content-pipeline && $(PYTHON) -m ezber_pipeline build

pipeline-offline:
	cd content-pipeline && $(PYTHON) -m ezber_pipeline build --offline

verify:
	cd content-pipeline && $(PYTHON) -m ezber_pipeline verify

test:
	cd content-pipeline && $(PYTHON) -m unittest discover -s tests -t .

clean:
	rm -rf content-pipeline/.cache content-pipeline/build/ezber-content.sqlite \
		content-pipeline/build/ezber-content.sqlite-journal
