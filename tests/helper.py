import os
import shutil
import argparse

from apimaticcli.argument_adder import ArgumentAdder

class Helper:
    """Contains helper methods for testing."""
    @classmethod
    def delete_folder(cls, path):
        """Deletes a folder recursively.

        Deletes a folder and all it's contents recursively.

        Args:
            path: The path of the folder.
        """
        if os.path.exists(path):
            shutil.rmtree(path)
