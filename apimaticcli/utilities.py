import os
import cgi
import base64

class Utilities:
    """A class for utility functions."""

    @classmethod
    def write_directory(cls,path,name,content):
        """Writes a file.

        Give an output path, a file name and content data,
        this functions writes a folder in wb mode.

        Args:
            path: The path of the folder in which to create
                the file.
            name: The name of the file to create.
            content: The data to write into the file.
        Returns:
            name: The name of the file created.
        """
        cls.create_directories(path)
        cls.write_file(path,name,content)
        return name

    @classmethod
    def write_file(cls, path, name, content):
        """Writes a file.

        Give an output path, a file name and content data,
        this functions writes a file in wb mode.

        Args:
            path: The path of the folder in which to create
                the file.
            name: The name of the file to create.
            content: The data to write into the file.
        """
        with open(os.path.join(path, name), 'wb') as f:
            f.write(content)
    @classmethod
    def create_directories(cls, path):
        """Creates directories.

        Checks if a path exists. Creates the required
        directories if it doesn't.

        Args:
            path: The hierarchical path to check.
        """
        if not os.path.exists(path):
            try:
                os.makedirs(path)
            except OSError as exc:
                if exc.errno != errno.EEXIST:
                    raise

    @classmethod
    def generate_auth_header(cls, args):
        """Generates value of the Authorization header.

        Args:
            args: The arguments passed to the client.

        Returns:
            The value of the 'Authorization' header.
        """
        if hasattr(args, 'email') and hasattr(args, 'password'):
            joined = '{}:{}'.format(args.email, args.password)
            encoded = base64.b64encode(str.encode(joined)).decode('iso-8859-1')
            return 'Basic {}'.format(encoded)
        elif hasattr(args, 'auth_key'):
            return 'X-Auth-Key {}'.format(args.auth_key)
        else:
            raise ValueError('Either the user credentials or the user auth key is required.')
