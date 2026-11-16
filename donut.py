import numpy as np
from time import sleep
import sys

screen_size = 18
theta_spacing = 0.1
phi_spacing = 0.04
illumination = np.fromiter(".,-~:;=!*#$@", dtype="<U1")

A = 1
B = 1
R1 = 1
R2 = 2
K2 = 5
K1 = screen_size * K2 * 3 / (8 * (R1 + R2))
phi = np.arange(0, 2 * np.pi, phi_spacing)
cos_phi = np.cos(phi)
sin_phi = np.sin(phi)
theta = np.arange(0, 2 * np.pi, theta_spacing)
cos_theta = np.cos(theta)
sin_theta = np.sin(theta)
circle_x = R2 + R1 * cos_theta
circle_y = R1 * sin_theta


def render_frame(A: float, B: float) -> np.ndarray:
    """
    Returns a frame of the spinning 3D donut.
    Based on the pseudocode from: https://www.a1k0n.net/2011/07/20/donut-math.html
    """
    cos_A = np.cos(A)
    sin_A = np.sin(A)
    cos_B = np.cos(B)
    sin_B = np.sin(B)

    output = np.full((screen_size, screen_size), " ")
    zbuffer = np.zeros((screen_size, screen_size))

    x = (np.outer(cos_B * cos_phi + sin_A * sin_B * sin_phi, circle_x) - circle_y * cos_A * sin_B).T
    y = (np.outer(sin_B * cos_phi - sin_A * cos_B * sin_phi, circle_x) + circle_y * cos_A * cos_B).T
    z = ((K2 + cos_A * np.outer(sin_phi, circle_x)) + circle_y * sin_A).T
    ooz = np.reciprocal(z)  # Calculates 1/z
    xp = (screen_size / 2 + K1 * ooz * x).astype(int)
    yp = (screen_size / 2 - K1 * ooz * y).astype(int)
    L1 = ((np.outer(cos_phi, cos_theta) * sin_B) - cos_A * np.outer(sin_phi, cos_theta)) - sin_A * sin_theta
    L2 = cos_B * (cos_A * sin_theta - np.outer(sin_phi, cos_theta * sin_A))
    L = np.around(((L1 + L2) * 8)).astype(int).T
    mask_L = L >= 0
    chars = illumination[L]

    for i in range(len(theta)):
        # need bounds checking for xp and yp to prevent index errors
        # if the donut moves partially off screen due to K1 value
        valid_indices = (xp[i] >= 0) & (xp[i] < screen_size) & \
                        (yp[i] >= 0) & (yp[i] < screen_size)
        
        # apply mask and update buffers only where indices are valid
        if np.any(valid_indices):
            valid_xp = xp[i][valid_indices]
            valid_yp = yp[i][valid_indices]
            valid_ooz = ooz[i][valid_indices]
            valid_chars = chars[i][valid_indices]
            valid_mask = mask_L[i][valid_indices] & (valid_ooz > zbuffer[valid_xp, valid_yp])

            zbuffer[valid_xp, valid_yp] = np.where(valid_mask, valid_ooz, zbuffer[valid_xp, valid_yp])
            output[valid_xp, valid_yp] = np.where(valid_mask, valid_chars, output[valid_xp, valid_yp])

    return output


def pprint(array: np.ndarray) -> None:
    """Pretty print the frame to standard output."""
    sys.stdout.write("\n".join("".join(row) for row in array))
    sys.stdout.flush()

if __name__ == "__main__":
    while True:
        sys.stdout.write("\x1b[2J\x1b[H")
        A += theta_spacing
        B += phi_spacing
        pprint(render_frame(A, B))
        sleep(0.03)