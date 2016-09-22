import os
import shutil
import argparse

from apimaticcli.argument_adder import ArgumentAdder

class Helper:
    """Contains helper methods for testing."""
    @classmethod
    def get_namespace(cls):
        """Returns a default argparse namespace.
            
        This function sets default values of arguments
        from argument adder for tests on an argparse
        Namespace object.

        Returns: An argparse Namespace object with
            default values set.
        """
        namespace = argparse.Namespace
        for key, value in ArgumentAdder.arguments.items():
            for k, v in value.items():
                if k == 'default':
                    setattr(namespace, key.replace('--', '').replace('-', '_'), v)
        return namespace

    @classmethod
    def delete_folder(cls, path):
        """Deletes a folder recursively.

        Deletes a folder and all it's contents recursively.

        Args:
            path: The path of the folder.
        """
        if os.path.exists(path):
            shutil.rmtree(path)
