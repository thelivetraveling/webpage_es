SHELL = /bin/bash

.PHONY: help
help:
	@echo -e "\n\e[36mIf you want testing the page, you just use the command: \e[97mmake test\e[0m\n"
	@grep -oE '^[a-zA-Z0-9_-]+:.*?## .*$$|\*\+[%0-9a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	| awk 'BEGIN {FS = ":.*?## "}{printf "\033[36m%-30s\033[39m %s\n", $$1, $$2}' \
	| sort -u

.PHONY: test
test: .test ## Just run this command and reach https://localhost:4000/

.PHONY: check_all_content
check_all_content: .all_posts ## If you want to see Drafts and Future posts just use that

.PHONY: upload
upload: .upload ## Add all files and commit the files with message, for e.g. upload MESSAGE="Add files"

.PHONY: upload
download: .download ## Downloading the files ¡¡WARNING!! this operation push in stash your changes

clean: ## Clean the environment
	@rm -Rf _site/
	@rm -Rf .sass-cache/
	@rm -f Gemfile.lock
	@rm -f package-lock.json

#------------------------------------------------
#|               Private targets                |
#------------------------------------------------
.test:
	@bundle exec jekyll serve

.all_posts:
	@bundle exec jekyll serve --future --drafts

.upload:
ifeq ($(MESSAGE),)
	@echo "Error: MESSAGE is not set, please use the variable MESSAGE before to upload the code, like that: make upload MESSAGE=\"Add new files\""
else
	@git add .
	@git commit -m "$(MESSAGE)"
	@git push
endif

.download:
	@git stash push -a
	@git pull --rebase
	@git stash pop

.PHONY: $(PHONY)
.DEFAULT_GOAL: help
