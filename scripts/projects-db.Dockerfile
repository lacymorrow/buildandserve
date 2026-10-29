# projects-db image (LAC-6218). Built on the box by `bas-projects-db.sh build-image`.
#
# postgres:17-alpine plus two things it does not ship:
#   pgbackrest  archive_command and restore, see projects-db-backup.sh (LAC-5980)
#   pgvector    keepsake has six vector columns and cannot restore without it
#
# pgvector is compiled against the image's own PG headers rather than installed
# from apk: Alpine's postgresql17-pgvector targets Alpine's Postgres layout, not
# the /usr/local build the official image uses. OPTFLAGS is emptied because the
# default is -march=native, which would bake the build host's CPU into the .so.
# The extension is only installed here. `CREATE EXTENSION vector` is run per
# database, and only in keepsake.
FROM postgres:17-alpine

ARG PGVECTOR_VERSION=0.8.6
ARG PGVECTOR_SHA256=10bf9938906e5d643bbc4a7eea104b6f57ba4898e5b76b20e60484ea1d5a7f8f

RUN set -eux; \
	apk add --no-cache pgbackrest; \
	apk add --no-cache --virtual .pgvector-build build-base wget; \
	wget -qO /tmp/pgvector.tar.gz "https://github.com/pgvector/pgvector/archive/refs/tags/v${PGVECTOR_VERSION}.tar.gz"; \
	echo "${PGVECTOR_SHA256}  /tmp/pgvector.tar.gz" | sha256sum -c -; \
	mkdir /tmp/pgvector; \
	tar -xzf /tmp/pgvector.tar.gz -C /tmp/pgvector --strip-components 1; \
	make -C /tmp/pgvector OPTFLAGS="" with_llvm=no; \
	make -C /tmp/pgvector OPTFLAGS="" with_llvm=no install; \
	rm -rf /tmp/pgvector /tmp/pgvector.tar.gz; \
	apk del --no-network .pgvector-build
