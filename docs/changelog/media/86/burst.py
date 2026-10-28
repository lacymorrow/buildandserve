import socket, sys, time, errno
host, port, n = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
addrs = socket.getaddrinfo(host, port, socket.AF_INET, socket.SOCK_STREAM)
sa = addrs[0][4]
held, reset, timeout, other = [], 0, 0, {}
t0 = time.time()
for i in range(n):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(4)
    try:
        s.connect(sa)
        held.append(s)
    except ConnectionResetError:
        reset += 1
    except ConnectionRefusedError:
        reset += 1
    except socket.timeout:
        timeout += 1
    except OSError as e:
        other[e.errno] = other.get(e.errno, 0) + 1
print(f"target={host}:{port} attempted={n} elapsed={time.time()-t0:.2f}s")
print(f"  established = {len(held)}")
print(f"  refused/reset = {reset}")
print(f"  timed out (dropped) = {timeout}")
if other: print(f"  other = {other}")
for s in held: s.close()
