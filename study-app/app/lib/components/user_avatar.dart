/// components/user_avatar.dart —— 用户头像（有图显示图，无图显示首字）
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/auth_provider.dart';
import '../services/platform_service.dart';

class UserAvatar extends ConsumerStatefulWidget {
  final double radius;
  const UserAvatar({super.key, this.radius = 14});

  @override
  ConsumerState<UserAvatar> createState() => _UserAvatarState();
}

class _UserAvatarState extends ConsumerState<UserAvatar> {
  Uint8List? _bytes;
  String? _loadedFor;

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).value?.user;
    final cs = Theme.of(context).colorScheme;
    if (user == null) {
      return CircleAvatar(radius: widget.radius, backgroundColor: cs.surfaceContainerHighest);
    }
    final key = '${user.username}|${user.avatar ?? ''}';
    if (user.avatar != null && user.avatar!.isNotEmpty && _loadedFor != key) {
      _loadedFor = key;
      PlatformService().avatarBytes(user.username).then((resp) {
        if (mounted) setState(() => _bytes = Uint8List.fromList(resp.data ?? []));
      }).catchError((_) {});
    }
    if (_bytes != null) {
      return CircleAvatar(radius: widget.radius, backgroundImage: MemoryImage(_bytes!));
    }
    return CircleAvatar(
      radius: widget.radius,
      backgroundColor: cs.primary,
      child: Text(
        user.displayName.characters.take(2).toString().toUpperCase(),
        style: TextStyle(color: Colors.white, fontSize: widget.radius * 0.75, fontWeight: FontWeight.w600),
      ),
    );
  }
}
