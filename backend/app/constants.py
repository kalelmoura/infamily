"""Application-wide domain constants.

Values in this module are part of the persisted data contract. Keeping the
walk-in client id here gives every service and router one canonical value to
compare against instead of scattering a magic UUID across the codebase.
"""

from uuid import UUID


# Seeded by the clients migration. The migration repeats the literal rather
# than importing application code so that historical migrations remain
# self-contained and reproducible even if this module changes in the future.
WALK_IN_CLIENT_ID = UUID("00000000-0000-0000-0000-000000000001")
